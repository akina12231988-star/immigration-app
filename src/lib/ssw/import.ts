// 旧HTMLツールの「JSON保存」ファイル・外部データ（Notion在籍履歴など）を
// 新スキーマ用に正規化する純粋関数。docs/03_database_design.md §8 のマッピングに対応。
// DOM・Supabase に依存しない。

import { VISA_TYPES, type VisaType } from "@/types/ssw";
import { WORKER_STATUSES, type WorkerStatus } from "@/types/db";

export interface ParsedHistory {
  visa: VisaType;
  start_date: string;
  end_date: string | null;
  org_name: string;
  role: string;
  note: string;
}

export interface ParsedWorker {
  legacy_id: string | null;
  name: string;
  kana: string;
  nationality: string;
  birth: string | null;
  residence_card_no: string;
  field: string;
  note: string;
  histories: ParsedHistory[];
  // 以下は任意項目（旧HTML由来のJSONには無いことが多いため未設定なら既定値を使う）
  status?: WorkerStatus;
  residence_status?: string;
  residence_permit_date?: string | null;
  residence_expiry_date?: string | null;
  messenger_link?: string;
  organization_name?: string; // 名称で会社・機関マスタに解決（無ければ新規作成）
}

export interface ImportResult {
  workers: ParsedWorker[];
  workerCount: number;
  historyCount: number;
  skipped: string[]; // スキップ・補正した項目の説明
}

const VISA_SET = new Set<string>(VISA_TYPES);

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

// YYYY-MM-DD へ正規化（YYYY/MM/DD や日付なしにも対応）。不正なら null
function normDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 旧データの様々なキー名を吸収して1件の職歴に変換する
function parseHistory(raw: unknown, skipped: string[], who: string): ParsedHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;

  const start = normDate(h.start ?? h.startDate ?? h.start_date ?? h.from);
  if (!start) {
    skipped.push(`${who}: 開始日のない職歴をスキップ`);
    return null;
  }
  const end = normDate(h.end ?? h.endDate ?? h.end_date ?? h.to);

  const rawVisa = str(h.visa ?? h.visaType ?? h.type ?? h.status);
  let visa: VisaType;
  if (VISA_SET.has(rawVisa)) {
    visa = rawVisa as VisaType;
  } else {
    visa = "その他";
    if (rawVisa) skipped.push(`${who}: 未知の在留資格「${rawVisa}」→「その他」に変換`);
  }

  return {
    visa,
    start_date: start,
    end_date: end,
    org_name: str(h.org ?? h.orgName ?? h.company ?? h.organization),
    role: str(h.role ?? h.job ?? h.work),
    note: str(h.note ?? h.memo),
  };
}

function parseWorker(raw: unknown, skipped: string[]): ParsedWorker | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const name = str(w.name ?? w.fullName ?? w.氏名);
  if (!name) {
    skipped.push("氏名のないレコードをスキップ");
    return null;
  }

  const histories: ParsedHistory[] = [];
  const rawHistories = w.history ?? w.histories ?? w.workHistory;
  if (Array.isArray(rawHistories)) {
    for (const h of rawHistories) {
      const parsed = parseHistory(h, skipped, name);
      if (parsed) histories.push(parsed);
    }
  }
  // 旧v1: periods[] は特定技能1号として取り込む
  const periods = w.periods;
  if (Array.isArray(periods)) {
    for (const p of periods) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      const start = normDate(pr.start ?? pr.from ?? pr.startDate);
      if (!start) continue;
      histories.push({
        visa: "特定技能1号",
        start_date: start,
        end_date: normDate(pr.end ?? pr.to ?? pr.endDate),
        org_name: str(pr.org ?? pr.company),
        role: str(pr.role),
        note: str(pr.note),
      });
    }
  }

  // 在籍状況（Notion在籍履歴など）。既知の値でなければ未設定のまま（DB既定値 支援中 が使われる）
  const rawStatus = str(w.status ?? w.在籍状況);
  const status = (WORKER_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as WorkerStatus)
    : undefined;
  if (rawStatus && !status) {
    skipped.push(`${name}: 未知の状態「${rawStatus}」はスキップ（既定値を使用）`);
  }

  return {
    legacy_id: str(w.id ?? w.legacyId ?? w.legacy_id) || null,
    name,
    kana: str(w.kana ?? w.furigana ?? w.フリガナ),
    nationality: str(w.nationality ?? w.country ?? w.国籍),
    birth: normDate(w.birth ?? w.birthday ?? w.dob ?? w.生年月日),
    residence_card_no: str(w.residenceCard ?? w.residence_card_no ?? w.cardNo ?? w.在留カード番号),
    field: str(w.field ?? w.industry ?? w.分野),
    note: str(w.note ?? w.memo ?? w.備考),
    histories,
    status,
    residence_status: str(w.residence_status ?? w.residenceStatus ?? w.在留資格) || undefined,
    residence_permit_date: normDate(w.residence_permit_date ?? w.residencePermitDate ?? w.在留許可日),
    residence_expiry_date: normDate(w.residence_expiry_date ?? w.residenceExpiryDate ?? w.在留期限日),
    messenger_link: str(w.messenger_link ?? w.messengerLink ?? w.メッセンジャー) || undefined,
    organization_name: str(w.organization_name ?? w.organizationName ?? w.所属機関) || undefined,
  };
}

// トップレベルは { workers: [...] } / { data: [...] } / 配列 のいずれも受け付ける
export function parseLegacyJson(raw: unknown): ImportResult {
  const skipped: string[] = [];
  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.workers ?? obj.data ?? obj.list;
    if (Array.isArray(candidate)) list = candidate;
  }

  const workers: ParsedWorker[] = [];
  for (const item of list) {
    const parsed = parseWorker(item, skipped);
    if (parsed) workers.push(parsed);
  }

  const historyCount = workers.reduce((sum, w) => sum + w.histories.length, 0);
  return { workers, workerCount: workers.length, historyCount, skipped };
}
