// 履歴書ペイロード（docType:"resume"）→ 外国人＋職歴レコードへの変換（純粋関数）。
// 履歴書ツールが埋め込む共通フォーマットに対応。DOM・Supabaseに依存しない。

import { VISA_TYPES, type VisaType } from "@/types/ssw";
import type { DocPayloadBase } from "./payload";

// 取り込み後に workers / work_histories へ投入するための正規化済みレコード。
export interface ImportedHistory {
  visa: VisaType;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  org_name: string;
  role: string;
  note: string;
}

export interface ImportedWorker {
  legacy_id: string; // 再取込の重複防止キー（pdf:氏名:生年月日）
  name: string;
  kana: string;
  nationality: string;
  birth: string | null;
  residence_status: string;
  residence_expiry_date: string | null;
  field: string;
  specialty_grade: string;
  other_qualifications: string;
  health_note: string;
  family_note: string;
  note: string;
  histories: ImportedHistory[];
}

export interface ResumeMapResult {
  worker: ImportedWorker;
  warnings: string[];
}

const VISA_SET = new Set<string>(VISA_TYPES);

// 履歴書の「当時の在留資格（日本語）」→ 職歴の在留資格区分（VisaType）へ対応付け。
const RESIDENCE_JA_TO_VISA: Record<string, VisaType> = {
  技能実習1号で修了: "技能実習",
  技能実習2号で修了: "技能実習",
  技能実習3号で修了: "技能実習",
  "特定活動（特定技能1号移行準備）": "特定活動（特定技能1号移行準備）",
  "特定活動（コロナによる帰国困難）": "その他",
  特定技能1号: "特定技能1号",
  特定技能2号: "特定技能2号",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

// "YYYY-MM-DD" / "YYYY/MM/DD" / ISO日時 を YYYY-MM-DD へ。不正なら null。
function normDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 年・月 → その月の1日。年が無ければ null。
function ymToDate(year: unknown, month: unknown): string | null {
  const y = str(year).match(/^\d{4}$/) ? str(year) : "";
  if (!y) return null;
  const mo = str(month).match(/^\d{1,2}$/) ? str(month).padStart(2, "0") : "01";
  const moNum = Math.min(Math.max(parseInt(mo, 10) || 1, 1), 12);
  return `${y}-${String(moNum).padStart(2, "0")}-01`;
}

function mapVisa(residenceJa: string, warnings: string[], who: string): VisaType {
  const s = str(residenceJa);
  if (!s) return "その他";
  if (RESIDENCE_JA_TO_VISA[s]) return RESIDENCE_JA_TO_VISA[s];
  if (VISA_SET.has(s)) return s as VisaType;
  warnings.push(`${who}: 在留資格「${s}」を「その他」として取り込み`);
  return "その他";
}

interface ResumePayloadShape extends DocPayloadBase {
  basic?: Record<string, unknown>;
  careers?: unknown[];
  families?: unknown[];
}

// 履歴書ペイロードを ImportedWorker に変換する。職歴は行数制限なしで全件取り込む（要件⑪）。
export function resumePayloadToWorker(payload: DocPayloadBase & Record<string, unknown>): ResumeMapResult {
  const warnings: string[] = [];
  const p = payload as ResumePayloadShape;
  const b = (p.basic ?? {}) as Record<string, unknown>;

  const name = str(b.name);
  const birth = normDate(b.birth);

  // 職歴（careers）→ histories。全件。
  const histories: ImportedHistory[] = [];
  const careers = Array.isArray(p.careers) ? p.careers : [];
  careers.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const c = raw as Record<string, unknown>;
    const start = ymToDate(c.startYear, c.startMonth);
    const org = str(c.company);
    const residence = str(c.residenceStatus);
    if (!start && !org && !residence) return; // 完全な空行はスキップ
    if (!start) {
      warnings.push(`${name || "無名"}: 開始年のない職歴${i + 1}件目を開始日なしで取り込み`);
    }
    histories.push({
      visa: mapVisa(residence, warnings, name || "無名"),
      start_date: start ?? "",
      end_date: ymToDate(c.endYear, c.endMonth),
      org_name: org,
      role: "",
      note: residence ? `当時の在留資格: ${residence}` : "",
    });
  });

  // 家族構成 → family_note
  const families = Array.isArray(p.families) ? p.families : [];
  const familyNote = families
    .map((raw) => {
      if (!raw || typeof raw !== "object") return "";
      const f = raw as Record<string, unknown>;
      const rel = str(f.relation);
      const nm = str(f.name);
      const by = str(f.birthYear);
      const job = str(f.job);
      const parts = [rel, nm, by ? `${by}年生` : "", job].filter(Boolean);
      return parts.join(" ");
    })
    .filter(Boolean)
    .join("\n");

  // 身体・生活情報 → health_note
  const healthParts = [
    b.height ? `身長 ${str(b.height)}cm` : "",
    b.weight ? `体重 ${str(b.weight)}kg` : "",
    b.bloodType ? `血液型 ${str(b.bloodType)}` : "",
    b.vision ? `視力 ${str(b.vision)}` : "",
    b.dominantHand ? `利き手 ${str(b.dominantHand)}` : "",
    b.illness ? `病気 ${str(b.illness)}` : "",
    b.drinking ? `飲酒 ${str(b.drinking)}` : "",
    b.smoking ? `タバコ ${str(b.smoking)}` : "",
    b.hobby ? `趣味 ${str(b.hobby)}` : "",
  ].filter(Boolean);

  // 列に対応しない基本情報 → note
  const noteParts = [
    b.gender ? `性別: ${str(b.gender)}` : "",
    b.languages ? `理解できる言語: ${str(b.languages)}` : "",
    b.spouse ? `配偶者: ${str(b.spouse)}` : "",
    b.trainingWork ? `実習の作業名: ${str(b.trainingWork)}` : "",
    normDate(b.trainingEnd) ? `実習修了日: ${normDate(b.trainingEnd)}` : "",
    b.addressJapan ? `日本での住居地: ${str(b.addressJapan)}` : "",
    b.addressHome ? `本国の住居地: ${str(b.addressHome)}` : "",
  ].filter(Boolean);

  const worker: ImportedWorker = {
    legacy_id: `pdf:${name}:${birth ?? ""}`,
    name,
    kana: str(b.kana),
    nationality: str(b.nationality),
    birth,
    residence_status: str(b.residenceStatus),
    residence_expiry_date: normDate(b.visaExpiry),
    field: str(b.trainingType),
    specialty_grade: "",
    other_qualifications: str(b.qualifications),
    health_note: healthParts.join(" / "),
    family_note: familyNote,
    note: noteParts.join("\n"),
    histories,
  };

  return { worker, warnings };
}
