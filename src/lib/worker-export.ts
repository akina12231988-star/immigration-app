import type { CellValue, SheetSpec } from "@/lib/xlsx-export";
import type { SswCalcResult } from "@/lib/ssw/calc";
import type { WorkerWithHistories } from "@/types/db";

// 外国人管理の「選んだ外国人 × 選んだ項目」を Excel に書き出す。
//
// 一覧で外国人にチェックを付け、出したい項目（氏名・生年月日・在留期限 など）を選ぶと、
// 1行1人の表（1行目が見出し）を .xlsx にする。項目はこのファイルの一覧で管理し、
// 画面はこの一覧をそのまま選択肢に出す。

export interface WorkerExportContext {
  orgName: (orgId: string | null) => string; // 所属機関名（無ければ ""）
  calc: (worker: WorkerWithHistories) => SswCalcResult | null; // 特定技能1号の通算（無ければ null）
}

export interface WorkerExportColumn {
  key: string;
  label: string;
  group: string;
  value: (w: WorkerWithHistories, ctx: WorkerExportContext) => CellValue;
  width?: number; // 列幅（文字数）
}

const s = (v: string | null | undefined): string => (v ?? "").trim();
const bool = (v: boolean | null | undefined): string => (v ? "はい" : "");

const ymText = (r: SswCalcResult | null): string => (r ? `${r.used.y}年${r.used.m}か月` : "");

export const WORKER_EXPORT_COLUMNS: WorkerExportColumn[] = [
  // 基本
  { key: "worker_code", label: "外国人ID", group: "基本", value: (w) => s(w.worker_code), width: 10 },
  { key: "name", label: "氏名", group: "基本", value: (w) => s(w.name), width: 24 },
  { key: "kana", label: "フリガナ", group: "基本", value: (w) => s(w.kana), width: 20 },
  { key: "nationality", label: "国籍", group: "基本", value: (w) => s(w.nationality), width: 10 },
  { key: "birth", label: "生年月日", group: "基本", value: (w) => s(w.birth), width: 12 },
  { key: "gender", label: "性別", group: "基本", value: (w) => s(w.gender), width: 6 },
  { key: "has_spouse", label: "配偶者の有無", group: "基本", value: (w) => s(w.has_spouse), width: 10 },
  { key: "field", label: "分野・職種", group: "基本", value: (w) => s(w.field), width: 14 },
  { key: "status", label: "ステータス", group: "基本", value: (w) => s(w.status), width: 12 },
  { key: "support", label: "支援区分", group: "基本", value: (w) => s(w.support), width: 10 },
  // 所属
  { key: "org", label: "現在の所属機関", group: "所属", value: (w, c) => c.orgName(w.current_organization_id), width: 24 },
  { key: "employment_start_on", label: "雇用開始日", group: "所属", value: (w) => s(w.employment_start_on), width: 12 },
  { key: "assigned_office", label: "配属先営業所", group: "所属", value: (w) => s(w.assigned_office), width: 14 },
  { key: "residence_note", label: "居住先", group: "所属", value: (w) => s(w.residence_note), width: 14 },
  // 在留
  { key: "residence_status", label: "在留資格", group: "在留", value: (w) => s(w.residence_status), width: 14 },
  { key: "residence_period", label: "在留期間", group: "在留", value: (w) => s(w.residence_period), width: 8 },
  { key: "residence_permit_date", label: "在留許可日", group: "在留", value: (w) => s(w.residence_permit_date), width: 12 },
  { key: "residence_expiry_date", label: "在留期限", group: "在留", value: (w) => s(w.residence_expiry_date), width: 12 },
  { key: "residence_card_no", label: "在留カード番号", group: "在留", value: (w) => s(w.residence_card_no), width: 14 },
  { key: "ssw_total", label: "特定技能1号の通算", group: "在留", value: (w, c) => ymText(c.calc(w)), width: 14 },
  { key: "ssw_expiry", label: "通算5年の満了予定日", group: "在留", value: (w, c) => s(c.calc(w)?.expiry), width: 14 },
  { key: "residence_renewal_status", label: "在留更新の対応状況", group: "在留", value: (w) => s(w.residence_renewal_status), width: 14 },
  { key: "residence_renewal_todo", label: "申請TODO番号", group: "在留", value: (w) => s(w.residence_renewal_todo), width: 12 },
  // パスポート
  { key: "passport_no", label: "パスポート番号", group: "パスポート", value: (w) => s(w.passport_no), width: 12 },
  { key: "passport_issue_date", label: "パスポート発行日", group: "パスポート", value: (w) => s(w.passport_issue_date), width: 12 },
  { key: "passport_expiry_date", label: "パスポート有効期限", group: "パスポート", value: (w) => s(w.passport_expiry_date), width: 12 },
  // 住所・連絡先
  { key: "address", label: "日本の住所", group: "住所・連絡先", value: (w) => s(w.address), width: 36 },
  { key: "home_address", label: "母国の住所", group: "住所・連絡先", value: (w) => s(w.home_address), width: 30 },
  { key: "messenger_link", label: "Messenger リンク", group: "住所・連絡先", value: (w) => s(w.messenger_link), width: 30 },
  { key: "file_link", label: "資料ファイルのリンク", group: "住所・連絡先", value: (w) => s(w.file_link), width: 30 },
  { key: "notion_link", label: "Notion リンク", group: "住所・連絡先", value: (w) => s(w.notion_link), width: 30 },
  // 番号
  { key: "my_number", label: "個人番号", group: "番号", value: (w) => s(w.my_number), width: 14 },
  { key: "employment_insurance_no", label: "雇用保険被保険者番号", group: "番号", value: (w) => s(w.employment_insurance_no), width: 16 },
  { key: "pension_no", label: "基礎年金番号", group: "番号", value: (w) => s(w.pension_no), width: 14 },
  { key: "recurring_sales_no", label: "定期売上No.", group: "番号", value: (w) => s(w.recurring_sales_no), width: 16 },
  // 資格・試験
  { key: "cert_nihongo", label: "日本語の試験名", group: "資格・試験", value: (w) => s(w.cert_nihongo_name), width: 18 },
  { key: "cert_nihongo_level", label: "日本語のレベル", group: "資格・試験", value: (w) => s(w.cert_nihongo_level), width: 10 },
  { key: "cert_senmongai", label: "技能試験名", group: "資格・試験", value: (w) => s(w.cert_senmongai_name), width: 18 },
  { key: "specialty_grade", label: "専門級の合格名", group: "資格・試験", value: (w) => s(w.specialty_grade), width: 16 },
  { key: "ssw2_exam", label: "特定技能2号の合格試験", group: "資格・試験", value: (w) => s(w.ssw2_exam), width: 18 },
  { key: "other_qualifications", label: "その他の資格", group: "資格・試験", value: (w) => s(w.other_qualifications), width: 18 },
  // 保険・健康
  { key: "ssw_insurance_expiry_date", label: "総合保険の有効期限", group: "保険・健康", value: (w) => s(w.ssw_insurance_expiry_date), width: 12 },
  { key: "ssw_insurance_no", label: "総合保険の証明書番号", group: "保険・健康", value: (w) => s(w.ssw_insurance_no), width: 16 },
  { key: "ssw_insurance_self_join", label: "総合保険の自己負担加入", group: "保険・健康", value: (w) => bool(w.ssw_insurance_self_join), width: 10 },
  { key: "health_check_on", label: "健康診断の受診日", group: "保険・健康", value: (w) => s(w.health_check_on), width: 12 },
  { key: "health_note", label: "健康メモ", group: "保険・健康", value: (w) => s(w.health_note), width: 20 },
  // 退職
  { key: "leaving_on", label: "退職日", group: "退職", value: (w) => s(w.leaving_on), width: 12 },
  { key: "leaving_kind", label: "退職区分", group: "退職", value: (w) => s(w.leaving_kind), width: 10 },
  { key: "leaving_reason", label: "退職理由", group: "退職", value: (w) => s(w.leaving_reason), width: 20 },
  { key: "leaving_org_name", label: "退職した所属機関", group: "退職", value: (w) => s(w.leaving_org_name), width: 20 },
  // その他
  { key: "current_situation", label: "只今の状況", group: "その他", value: (w) => s(w.current_situation), width: 30 },
  { key: "note", label: "備考", group: "その他", value: (w) => s(w.note), width: 30 },
  { key: "created_at", label: "登録日", group: "その他", value: (w) => s(w.created_at).slice(0, 10), width: 12 },
];

// 最初に選ばれている項目
export const DEFAULT_WORKER_EXPORT_KEYS = [
  "worker_code",
  "name",
  "kana",
  "nationality",
  "birth",
  "gender",
  "org",
  "residence_status",
  "residence_expiry_date",
  "residence_card_no",
];

// グループ名の並び（画面の選択肢の見出し順）
export function workerExportGroups(): string[] {
  const out: string[] = [];
  for (const c of WORKER_EXPORT_COLUMNS) if (!out.includes(c.group)) out.push(c.group);
  return out;
}

// 選んだ項目を、一覧の並び順にそろえた列にする（知らないキーは無視）
export function pickWorkerExportColumns(keys: Iterable<string>): WorkerExportColumn[] {
  const set = new Set(keys);
  return WORKER_EXPORT_COLUMNS.filter((c) => set.has(c.key));
}

// シート（1行目が見出し、2行目から1人1行）
export function buildWorkerExportSheet(
  workers: WorkerWithHistories[],
  keys: Iterable<string>,
  ctx: WorkerExportContext,
  sheetName = "外国人",
): SheetSpec {
  const cols = pickWorkerExportColumns(keys);
  return {
    name: sheetName,
    headerRows: 1,
    columnWidths: cols.map((c) => c.width ?? 14),
    rows: [cols.map((c) => c.label), ...workers.map((w) => cols.map((c) => c.value(w, ctx)))],
  };
}

// ファイル名（例: 外国人一覧_2026-10-14_12名.xlsx）
export function workerExportFileName(count: number, today: string): string {
  return `外国人一覧_${today}_${count}名.xlsx`;
}
