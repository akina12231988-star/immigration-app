// 月末の請求書作成の集計を、所属機関へ送るエクセル（在籍名簿）の形に組み立てる。
// 1シート目がサマリー、2シート目以降が所属機関ごとの在籍名簿。

import {
  daysText,
  monthLabel,
  periodText,
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
  "在留許可日",
  "当月許可",
  "在留期限日",
  "雇用開始",
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

function rosterRow(row: MonthlyBillingRow, index: number, month: string): CellValue[] {
  const w = row.worker;
  const permitThisMonth = (w.residence_permit_date ?? "").startsWith(month);
  return [
    index + 1,
    w.name,
    w.kana,
    w.nationality,
    w.gender,
    w.birth ?? "",
    w.residence_status,
    w.residence_card_no,
    w.residence_permit_date ?? "",
    permitThisMonth ? "⭕" : "",
    w.residence_expiry_date ?? "",
    w.employment_start_on ?? "",
    w.assigned_office,
    w.residence_note,
    w.recurring_sales_no,
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
      ...org.rows.map((row, i) => rosterRow(row, i, billing.month)),
      [],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "合計", org.total],
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

// ブック全体（サマリー＋所属機関ごとの在籍名簿）
export function monthlyBillingSheets(billing: MonthlyBilling): SheetSpec[] {
  return [summarySheet(billing), ...billing.orgs.map((o) => orgRosterSheet(o, billing))];
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
