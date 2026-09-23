// 「申請書類の準備状況の詳細」をA4縦1枚で印刷するための組み立て。
//
// 画面（申請準備の詳細）はスクロールして見ていく作りなので、そのままでは紙に収まらない。
// 印刷用に必要なところだけを「ラベル: 値」の行に直し、
//  ・上: 申請番号と申請種別
//  ・左: 所属機関の情報 / 外国人の情報
//  ・右: 準備チェックリスト / 採用時の賃金情報 / 日付計算結果
// の形で並べる。値はすべて文字列にしてあるので、印刷前にその場で直せる。

import { PREP_APP_TYPE_LABELS, prepDocLabel, type PrepChecklistMeta, type PrepDocStatus } from "@/lib/application-prep";
import { SUPPORT_CONTRACT_YEARS, contractPeriodEnd, planDateGroupsFor } from "@/lib/support-plan-dates";
import { flexHoursLabel } from "@/lib/org-attachments";
import { councilSubmissionsLine, financialSalesText } from "@/lib/organization-intake";
import { rosterJpDate } from "@/lib/roster";
import { sortWages, wageStartedOnLabel } from "@/lib/wage";
import { calcWageDetail, formatYen, hasWageDetail, normalizeWageDetail } from "@/lib/wage-calc";
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

// 協力確認書の提出先・提出日・確認方法を1行にする（画面と同じ書き方）
const councilLine = councilSubmissionsLine;

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

// 右側「採用時の賃金情報」。賃金の記録を新しい順（申請時の賃金＝雇用開始日からが先頭）に行にする。
// 現在の賃金に1-6号別紙の内容が入っていれば、その下に月額換算・所得税・社会保険料・雇用保険料・
// 居住費（食費・水道光熱費があればそれも）・手取り概算を続けて出す。
// orgHours は時給→月給の換算に使う所属機関ごとの年間所定労働時間
export function prepPrintWageLines(
  wages: WorkerWage[],
  orgNames: Record<string, string> = {},
  orgHours: Record<string, number> = {},
): PrepPrintLine[] {
  const yen = (n: number) => `${formatYen(n)}円`;
  return sortWages(wages).flatMap((w, i) => {
    const orgName = w.organization_id ? (orgNames[w.organization_id] ?? "") : "";
    const detail = [
      `${wageStartedOnLabel(w)}〜`,
      w.reason,
      orgName,
      w.detail && Object.keys(w.detail).length > 0 ? "1-6号別紙あり" : "",
    ]
      .filter(Boolean)
      .join("・");
    const lines: PrepPrintLine[] = [
      {
        key: w.id,
        label: `${w.kind}${i === 0 ? "（現在）" : ""}`,
        value: `${w.amount.toLocaleString("ja-JP")}円（${detail}）`,
      },
    ];
    // 1-6号別紙の内訳は現在の賃金だけ（A4縦1枚に収めるため）
    if (i !== 0 || !hasWageDetail(w.detail)) return lines;
    const d = normalizeWageDetail(w.detail);
    const r = calcWageDetail(w, d, w.organization_id ? (orgHours[w.organization_id] ?? 0) : 0);
    const conversion =
      w.kind === "時給" && r.annualHours > 0
        ? `（時給${w.amount.toLocaleString("ja-JP")}円 × 年間${r.annualHours.toLocaleString("ja-JP")}時間 ÷ 12）`
        : "";
    lines.push(
      { key: `${w.id}-base`, label: "基本賃金（月額換算）", value: r.base > 0 ? `${yen(r.base)}${conversion}` : "" },
    );
    if (r.allowanceTotal > 0) {
      lines.push({ key: `${w.id}-gross`, label: "支払概算額（諸手当込み）", value: yen(r.gross) });
    }
    // A4縦1枚に収めるため、税・保険と居住費などはそれぞれ1行にまとめる
    lines.push({
      key: `${w.id}-deduct`,
      label: "所得税／社会保険料／雇用保険料",
      value: `${yen(r.tax)}／${d.social_enabled ? yen(r.social) : "加入なし"}／${d.employment_enabled ? yen(r.employment) : "加入なし"}`,
    });
    const living = [
      `居住費 ${d.housing_self_contract ? "本人契約のため徴収なし" : yen(r.housing)}`,
      r.food > 0 ? `食費 ${yen(r.food)}` : "",
      r.utility > 0 ? `水道光熱費 ${yen(r.utility)}` : "",
      r.otherTotal > 0 ? `その他控除 ${yen(r.otherTotal)}` : "",
    ].filter(Boolean);
    lines.push({ key: `${w.id}-living`, label: "居住費など", value: living.join("／") });
    lines.push({ key: `${w.id}-net`, label: "手取り概算", value: yen(r.net) });
    return lines;
  });
}

// 右側「日付計算結果」。画面と同じく参考様式ごとの枠（見出し行）に分けて、保存済みの日付を出す。
// 雇用契約期間（2年間）と支援委託契約の契約期間（5年間）は保存した日付から自動で出す
// 印刷用の短い項目名（画面の項目名は長く、A4の狭い列では2行に折り返して行数が増えるため）
const PRINT_DATE_LABELS: Record<string, string> = {
  cond: "雇用条件書の作成日",
  period: "雇用契約期間（2年）",
  doc: "書類作成日",
  guid: "事前ガイダンス",
  orient: "生活オリエン実施日",
  scPeriod: "契約期間（5年）",
  apply: "申請予定日",
};

// 特定活動の申請は 1-5号・1-6号・その他（書類作成日を含む）の枠だけ
export function prepPrintDateLines(dates: Record<string, string>, tokuteiKatsudo = false): PrepPrintLine[] {
  const ymd = (v: string | undefined) => rosterJpDate(v ?? "") || (v ?? "");
  const period = (start: string | undefined, years?: number) =>
    start ? `${ymd(start)}〜${ymd(contractPeriodEnd(start, years))}` : "";
  return planDateGroupsFor(tokuteiKatsudo).flatMap((g, gi) => [
    { key: `group-${gi}`, label: g.title, value: "", heading: true },
    ...g.rows.map((r) => ({
      key: `${gi}-${r.key}`,
      // 1-25号の支援委託契約日は雇用契約日と同じ日（画面の項目名の補足は印刷では省く）
      label: r.key === "con" && g.title.includes("1-25") ? "支援委託契約日" : (PRINT_DATE_LABELS[r.key] ?? r.label),
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
