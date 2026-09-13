// 「申請書類の準備状況の詳細」をA4縦1枚で印刷するための組み立て。
//
// 画面（申請準備の詳細）はスクロールして見ていく作りなので、そのままでは紙に収まらない。
// 印刷用に必要なところだけを「ラベル: 値」の行に直し、
//  ・上: 申請番号と申請種別
//  ・左: 所属機関の情報 / 外国人の情報
//  ・右: 準備チェックリスト / 採用時の賃金情報 / 日付計算結果
// の形で並べる。値はすべて文字列にしてあるので、印刷前にその場で直せる。

import { PREP_APP_TYPE_LABELS, prepDocLabel, type PrepChecklistMeta, type PrepDocStatus } from "@/lib/application-prep";
import { PLAN_DATE_GROUPS, SUPPORT_CONTRACT_YEARS, contractPeriodEnd } from "@/lib/support-plan-dates";
import { flexHoursLabel } from "@/lib/org-attachments";
import { financialSalesText } from "@/lib/organization-intake";
import { rosterJpDate } from "@/lib/roster";
import { sortWages, wageStartedOnLabel } from "@/lib/wage";
import type { OrgCouncilSubmission, OrgFinancialYear, WorkerWage } from "@/types/db";

// 印刷する1行（ラベルと値）。値が空のときは印刷側で「未登録」を出す
export interface PrepPrintLine {
  key: string;
  label: string;
  value: string;
  heading?: boolean; // 見出しの行（参考様式ごとの枠）。値は無く、訂正もできない
}

// 書類1件の印刷状態。完了はチェック（☑）を付け、対象外にするとその行は印刷しない
export const PREP_PRINT_DOC_STATES = ["完了", "不足", "対象外"] as const;
export type PrepPrintDocState = (typeof PREP_PRINT_DOC_STATES)[number];

export interface PrepPrintDocRow {
  id: string;
  label: string;
  state: PrepPrintDocState;
  memo: string; // 右側のメモ欄（選んでいる準備状況を初めに入れる。書き換えられる）
}

// 印刷する申請種別。申請の内容（7つの選び方）を優先し、
// 内容を選ぶ前の古いデータは申請種別の表示名で出す
export function prepPrintAppType(meta: PrepChecklistMeta): string {
  if (meta.app_content) return meta.app_content;
  if (meta.app_type) return PREP_APP_TYPE_LABELS[meta.app_type];
  return "";
}

// 協力確認書の提出先と提出日を1行にする（画面と同じ書き方）
function councilLine(rows: OrgCouncilSubmission[]): string {
  const filled = rows.filter((r) => r.to || r.on);
  if (filled.length === 0) return "";
  return filled.map((r) => `${r.to || "提出先未記入"}（${r.on || "提出日未記入"}）`).join("、");
}

// 直近の売上高（売上が入っている決算情報の新しい2件。例: 「令和7年分 13,903,547円」）
function salesLine(financials: OrgFinancialYear[], fiscalKind: string): string {
  const rows = financials.filter((f) => f.sales).slice(0, 2);
  if (rows.length === 0) return "";
  return rows.map((f) => financialSalesText(f, fiscalKind)).join("、");
}

export interface PrepPrintOrg {
  name: string;
  address: string;
  contact: string;
  repName: string;
  repKana: string;
  councilOffice: OrgCouncilSubmission[];
  councilResidence: OrgCouncilSubmission[];
  councilNote: string;
  flexHoursKind: string; // 変形労働時間制（'' / なし / 1ヶ月単位 / 1年単位）
  fiscalKind: string; // 決算情報の区分（個人事業主 / 法人）
  financials: OrgFinancialYear[];
}

// 左側「所属機関の情報」（画面の所属機関の情報と同じ並び）
export function prepPrintOrgLines(org: PrepPrintOrg): PrepPrintLine[] {
  return [
    { key: "org_name", label: "所属機関名", value: org.name },
    { key: "org_address", label: "住所", value: org.address },
    { key: "org_contact", label: "電話番号", value: org.contact },
    {
      key: "org_rep",
      label: "代表者",
      value: org.repName ? `${org.repName}${org.repKana ? `（${org.repKana}）` : ""}` : "",
    },
    // 1年単位のときは年間カレンダー・労使協定書が要るので「1年単位の変形労働」と出す（未登録は空のまま）
    { key: "org_flex_hours", label: "変形労働時間制", value: org.flexHoursKind ? flexHoursLabel(org.flexHoursKind) : "" },
    {
      key: "org_council_office",
      label: "協力確認書（事業所の所在地）",
      value: councilLine(org.councilOffice),
    },
    {
      key: "org_council_residence",
      label: "協力確認書（住居地）",
      value: councilLine(org.councilResidence),
    },
    { key: "org_council_note", label: "協議会メモ", value: org.councilNote },
    { key: "org_sales", label: "直近の売上高", value: salesLine(org.financials, org.fiscalKind) },
  ];
}

export interface PrepPrintWorker {
  name: string;
  kana: string;
  birth: string;
  nationality: string;
  homeAddress: string;
  address: string;
  residenceStatus: string;
  residencePeriod: string;
  residenceCardNo: string;
  residenceExpiryDate: string;
  passportNo: string;
  passportExpiryDate: string;
}

// 左側「外国人の情報」（画面の外国人の情報と同じ並び）
export function prepPrintWorkerLines(w: PrepPrintWorker): PrepPrintLine[] {
  return [
    {
      key: "w_name",
      label: "氏名",
      value: w.name ? (w.kana ? `${w.name}（${w.kana}）` : w.name) : "",
    },
    { key: "w_birth", label: "生年月日", value: w.birth },
    { key: "w_nationality", label: "国籍", value: w.nationality },
    { key: "w_home_address", label: "本国における居住地", value: w.homeAddress },
    { key: "w_address", label: "住所", value: w.address },
    { key: "w_status", label: "在留資格", value: w.residenceStatus },
    { key: "w_period", label: "在留期間", value: w.residencePeriod },
    { key: "w_card_no", label: "在留カード番号", value: w.residenceCardNo },
    { key: "w_expiry", label: "在留期限", value: w.residenceExpiryDate },
    { key: "w_passport_no", label: "パスポート番号", value: w.passportNo },
    { key: "w_passport_expiry", label: "パスポート有効期限", value: w.passportExpiryDate },
  ];
}

// 右側「準備チェックリスト」。完了した書類にはチェック（☑）が付く。
// statuses は書類ID→選んでいる準備状況（右側のメモ欄の初めの値にする）
export function prepPrintDocRows(
  items: PrepDocStatus[],
  statuses: Record<string, string>,
  targetReiwa: number | null,
  currentReiwa: number,
): PrepPrintDocRow[] {
  return items.map((it) => ({
    id: it.def.id,
    label: prepDocLabel(it.def, targetReiwa, currentReiwa),
    state: it.satisfied ? "完了" : "不足",
    memo: statuses[it.def.id] ?? "",
  }));
}

// 右側「採用時の賃金情報」。賃金の記録を新しい順（申請時の賃金＝雇用開始日からが先頭）に行にする
export function prepPrintWageLines(
  wages: WorkerWage[],
  orgNames: Record<string, string> = {},
): PrepPrintLine[] {
  return sortWages(wages).map((w, i) => {
    const orgName = w.organization_id ? (orgNames[w.organization_id] ?? "") : "";
    const detail = [
      `${wageStartedOnLabel(w)}〜`,
      w.reason,
      orgName,
      w.detail && Object.keys(w.detail).length > 0 ? "1-6号別紙あり" : "",
    ]
      .filter(Boolean)
      .join("・");
    return {
      key: w.id,
      label: `${w.kind}${i === 0 ? "（現在）" : ""}`,
      value: `${w.amount.toLocaleString("ja-JP")}円（${detail}）`,
    };
  });
}

// 右側「日付計算結果」。画面と同じく参考様式ごとの枠（見出し行）に分けて、保存済みの日付を出す。
// 雇用契約期間（2年間）と支援委託契約の契約期間（5年間）は保存した日付から自動で出す
export function prepPrintDateLines(dates: Record<string, string>): PrepPrintLine[] {
  const ymd = (v: string | undefined) => rosterJpDate(v ?? "") || (v ?? "");
  const period = (start: string | undefined, years?: number) =>
    start ? `${ymd(start)} から ${ymd(contractPeriodEnd(start, years))} まで` : "";
  return PLAN_DATE_GROUPS.flatMap((g, gi) => [
    { key: `group-${gi}`, label: g.title, value: "", heading: true },
    ...g.rows.map((r) => ({
      key: `${gi}-${r.key}`,
      label: r.label,
      value:
        r.key === "period" ? period(dates.es) : r.key === "scPeriod" ? period(dates.con, SUPPORT_CONTRACT_YEARS) : ymd(dates[r.key]),
    })),
  ]);
}

// 印刷（PDF保存）したときのファイル名。「申請番号_氏名_申請準備の詳細」
export function prepPrintFileName(todoNo: string, workerName: string): string {
  const parts = [todoNo.trim(), workerName.trim(), "申請準備の詳細"].filter(Boolean);
  return parts.join("_").replace(/[\\/:*?"<>|]/g, "_");
}
