// 月末の請求書作成の集計を、所属機関へ送るエクセル（在籍名簿）の形に組み立てる。
// 1シート目がサマリー、2シート目以降が所属機関ごとの在籍名簿。

import {
  daysText,
  leftThisMonthRows,
  monthLabel,
  periodText,
  permittedThisMonthRows,
  employmentStartForOrg,
  recurringSalesNoForRow,
  rosterOrderRows,
  type MonthlyBilling,
  type MonthlyBillingOrg,
  type MonthlyBillingRow,
} from "@/lib/monthly-billing";
import type { CellValue, SheetSpec } from "@/lib/xlsx-export";

// 所属機関ごとの在籍名簿の見出し（エクセルの並びに合わせる）
export const ROSTER_HEADERS = [
  "No.",
  "氏名",
  "フリガナ",
  "国籍",
  "性別",
  "生年月日",
  "在留資格",
  "在留カード番号",
  "雇用開始",
  "在留許可日",
  "当月許可",
  "在留期限日",
  "配属先",
  "居住について",
  "定期売上No.",
  "支援代（月額）",
  "支援費算定期間",
  "日数",
  "区分",
  "支援費請求額",
  "在籍状況",
  "退職日",
] as const;

const ROSTER_WIDTHS = [5, 26, 22, 12, 6, 12, 22, 16, 12, 8, 12, 12, 12, 14, 18, 12, 24, 8, 16, 12, 10, 12];

function rosterRow(
  row: MonthlyBillingRow,
  index: number,
  month: string,
  organizationId: string,
): CellValue[] {
  const w = row.worker;
  // 転職者の前の機関の行では、許可は新しい機関のことなので⭕を付けない
  const permitThisMonth =
    !row.transferredOut && (w.residence_permit_date ?? "").startsWith(month);
  return [
    index + 1,
    w.name,
    w.kana,
    w.nationality,
    w.gender,
    w.birth ?? "",
    w.residence_status,
    w.residence_card_no,
    // その機関での雇用開始日（所属機関別の記録を優先）。許可日の前に置く
    employmentStartForOrg(w, organizationId),
    w.residence_permit_date ?? "",
    permitThisMonth ? "⭕" : "",
    w.residence_expiry_date ?? "",
    w.assigned_office,
    w.residence_note,
    // 転職者の前の機関の行は当時の番号（過去の定期売上No.）
    recurringSalesNoForRow(row, organizationId),
    row.monthlyFee,
    periodText(row),
    daysText(row),
    row.kind,
    row.amount,
    row.leftThisMonth ? "退職" : "在籍中",
    w.leaving_on ?? "",
  ];
}

// 所属機関1社分の在籍名簿シート
export function orgRosterSheet(org: MonthlyBillingOrg, billing: MonthlyBilling): SheetSpec {
  const countText =
    org.leftCount > 0
      ? `${org.rows.length}名（うち当月退職 ${org.leftCount}名）`
      : `${org.rows.length}名`;
  return {
    name: org.organizationName,
    headerRows: 1,
    columnWidths: ROSTER_WIDTHS,
    rows: [
      [`在籍名簿（${org.organizationName}）`],
      ["基準日", billing.monthEndOn, "掲載人数", countText],
      [],
      [...ROSTER_HEADERS],
      // 在籍名簿は雇用開始日の古い順（未登録は最後）。No.は rosterOrderRows の順で振り、
      // 請求書と照合のPDFに押すNo.と必ず一致させる
      ...rosterOrderRows(org).map((row, i) =>
        rosterRow(row, i, billing.month, org.organizationId),
      ),
      [],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "合計", org.total],
    ],
  };
}

const PERMITTED_HEADERS = [
  "No.",
  "所属機関",
  "氏名",
  "フリガナ",
  "国籍",
  "在留資格",
  "在留カード番号",
  "在留許可日",
  "在留期限日",
  "雇用開始",
  "定期売上No.",
  "区分",
  "支援費請求額",
] as const;

// 当月に在留許可が下りた人の一覧（新規・更新の両方。区分で見分けられる）
export function permittedThisMonthSheet(billing: MonthlyBilling): SheetSpec {
  const targets = permittedThisMonthRows(billing);

  return {
    name: "当月許可者",
    headerRows: 1,
    columnWidths: [5, 22, 26, 22, 12, 22, 16, 12, 12, 12, 18, 16, 12],
    rows: [
      [`当月許可者リスト（${monthLabel(billing.month)}）`],
      ["基準日", billing.monthEndOn, "人数", `${targets.length}名`],
      [],
      [...PERMITTED_HEADERS],
      ...targets.map(({ org, row }, i) => [
        i + 1,
        org.organizationName,
        row.worker.name,
        row.worker.kana,
        row.worker.nationality,
        row.worker.residence_status,
        row.worker.residence_card_no,
        row.worker.residence_permit_date ?? "",
        row.worker.residence_expiry_date ?? "",
        row.worker.employment_start_on ?? "",
        row.worker.recurring_sales_no,
        row.kind,
        row.amount,
      ]),
      ...(targets.length === 0 ? [["当月に在留許可が下りた方はいません。"]] : []),
    ],
  };
}

const LEFT_HEADERS = [
  "No.",
  "所属機関",
  "氏名",
  "フリガナ",
  "国籍",
  "在留資格",
  "退職日",
  "雇用開始",
  "定期売上No.",
  "支援費算定期間",
  "日数",
  "支援費請求額",
] as const;

// 当月に退職した人の一覧（退職日まで日割りで請求している人）
export function leftThisMonthSheet(billing: MonthlyBilling): SheetSpec {
  const targets = leftThisMonthRows(billing);

  return {
    name: "当月退職者",
    headerRows: 1,
    columnWidths: [5, 22, 26, 22, 12, 22, 12, 12, 18, 24, 8, 12],
    rows: [
      [`当月退職者リスト（${monthLabel(billing.month)}）`],
      ["基準日", billing.monthEndOn, "人数", `${targets.length}名`],
      [],
      [...LEFT_HEADERS],
      ...targets.map(({ org, row }, i) => [
        i + 1,
        org.organizationName,
        row.worker.name,
        row.worker.kana,
        row.worker.nationality,
        row.worker.residence_status,
        row.worker.leaving_on ?? "",
        row.worker.employment_start_on ?? "",
        // 転職者は当時の機関の番号（過去の定期売上No.）。freeeの定期売上の停止の突き合わせ用
        recurringSalesNoForRow(row, org.organizationId),
        periodText(row),
        daysText(row),
        row.amount,
      ]),
      ...(targets.length === 0 ? [["当月に退職された方はいません。"]] : []),
    ],
  };
}

// 1シート目のサマリー
export function summarySheet(billing: MonthlyBilling): SheetSpec {
  return {
    name: "サマリー",
    headerRows: 1,
    columnWidths: [34, 12, 14, 20],
    rows: [
      ["在籍名簿サマリー"],
      ["基準日", billing.monthEndOn],
      [],
      ["所属機関", "掲載人数", "うち当月退職", "支援費請求額合計"],
      ...billing.orgs.map((o) => [o.organizationName, o.rows.length, o.leftCount, o.total]),
      ["合計", billing.totalPeople, billing.totalLeft, billing.totalAmount],
    ],
  };
}

// ブック全体（サマリー＋当月許可者＋当月退職者＋所属機関ごとの在籍名簿）
export function monthlyBillingSheets(billing: MonthlyBilling): SheetSpec[] {
  return [
    summarySheet(billing),
    permittedThisMonthSheet(billing),
    leftThisMonthSheet(billing),
    ...billing.orgs.map((o) => orgRosterSheet(o, billing)),
  ];
}

// 所属機関1社分だけのブック（その機関へ送るとき用）
export function orgBillingSheets(org: MonthlyBillingOrg, billing: MonthlyBilling): SheetSpec[] {
  return [orgRosterSheet(org, billing)];
}

// ダウンロードするファイル名
export function billingFileName(billing: MonthlyBilling, orgName?: string): string {
  const base = `在籍名簿_${monthLabel(billing.month)}`;
  return orgName ? `${base}_${orgName}.xlsx` : `${base}.xlsx`;
}
