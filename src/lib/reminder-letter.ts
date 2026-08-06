// 督促状（未入金のお支払いのご確認）のエクセルを組み立てる。
// 弊社テンプレート「先月分が未入金の場合」の文面を再現し、
// 未入金（一部入金を含む）の請求と今回の請求をまとめた一覧と、
// 合算の参考合計（未入金の残額＋今回のご請求額）を載せる。

import type { SheetSpec } from "@/lib/xlsx-export";

// 一覧の1行分（未入金・一部入金・今回の請求）
export interface ReminderInvoiceRow {
  billedOn: string; // 請求日 YYYY-MM-DD
  invoiceNo: string; // 請求書番号（freeeのINV-…）
  amount: number; // 請求金額
  paid: number; // 入金済み額（一部入金。0なら未入金）
  dueOn: string; // 支払期限 YYYY-MM-DD
}

export interface ReminderLetterInput {
  orgName: string; // 宛名（所属機関名）
  honorific: string; // 敬称（様 / 御中）
  issuedOn: string; // 発行年月日 YYYY-MM-DD
  unpaid: ReminderInvoiceRow[]; // 未入金・一部入金の請求（古い順に表示）
  current: ReminderInvoiceRow | null; // 今回（対象月）の請求。区分は「請求中」
}

// 残額（請求金額 − 入金済み額。マイナスにはしない）
export function remainingAmount(row: ReminderInvoiceRow): number {
  return Math.max(row.amount - row.paid, 0);
}

// 参考合計 = 未入金の残額 ＋ 今回のご請求額（合算の金額）
export function reminderTotal(input: Pick<ReminderLetterInput, "unpaid" | "current">): number {
  const unpaid = input.unpaid.reduce((sum, r) => sum + remainingAmount(r), 0);
  return unpaid + (input.current ? remainingAmount(input.current) : 0);
}

// "2026-06-01" → "6月1日"
function mdJp(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : dateStr;
}

// "2026-06-01" → "2026/06/01"（一覧の日付表記）
function slashDate(dateStr: string): string {
  return dateStr.replaceAll("-", "/");
}

export function reminderFileName(orgName: string, issuedOn: string): string {
  return `督促状_${orgName}_${issuedOn}.xlsx`;
}

// 督促状1通分のシート
export function reminderLetterSheet(input: ReminderLetterInput): SheetSpec {
  const sorted = [...input.unpaid].sort((a, b) => a.billedOn.localeCompare(b.billedOn));
  const oldest = sorted[0];
  const hasPartial = sorted.some((r) => r.paid > 0);

  const rows: (string | number | null)[][] = [];
  rows.push([`${input.orgName}　${input.honorific}`, null, null, null, null, "発行年月日", slashDate(input.issuedOn)]);
  rows.push([]);
  rows.push([null, null, null, null, "登録支援機関 VUONG VAN THANH"]);
  rows.push([null, null, null, null, "担当：野口　明菜"]);
  rows.push([]);
  rows.push([null, "【ご確認のお願い】"]);
  rows.push([null, "未入金のお支払いについて"]);
  rows.push([]);
  rows.push(["いつも大変お世話になっております。"]);
  if (oldest) {
    rows.push([`さて、${mdJp(oldest.billedOn)}付で発行いたしましたご請求書につきまして`]);
    rows.push([`支払い期限を${mdJp(oldest.dueOn)}としておりましたが、本日現在、まだご入金の確認が`]);
    rows.push(["とれていない状況です。"]);
  }
  if (hasPartial) {
    rows.push(["一部ご入金をいただいている請求は、入金済み額と残額を記載しております。"]);
  }
  rows.push([]);
  if (input.current) {
    rows.push([`念の為、${mdJp(input.current.billedOn)}付で発行しております請求書分まで一覧に`]);
    rows.push(["まとめて記載しておりますので、ご確認いただけますと幸いです。"]);
    rows.push([]);
  }
  rows.push(["すでに、お支払いがお済みでした場合は、行き違いとなり誠に申し訳ございません。"]);
  rows.push(["何卒、ご確認のほど、よろしくお願い申し上げます。"]);
  rows.push([]);

  rows.push(["請求日", "請求書番号", "請求金額", "入金済み額", "ご請求額（残額）", "支払期限", "区分"]);
  for (const r of sorted) {
    rows.push([
      slashDate(r.billedOn),
      r.invoiceNo,
      r.amount,
      r.paid > 0 ? r.paid : null,
      remainingAmount(r),
      slashDate(r.dueOn),
      r.paid > 0 ? "一部入金" : "未入金",
    ]);
  }
  if (input.current) {
    rows.push([
      slashDate(input.current.billedOn),
      input.current.invoiceNo,
      input.current.amount,
      null,
      remainingAmount(input.current),
      slashDate(input.current.dueOn),
      "請求中",
    ]);
  }
  rows.push(["参考合計（未入金分＋今回ご請求分）", null, null, null, reminderTotal(input), null, null]);

  return {
    name: `督促状 ${input.orgName}`,
    rows,
    columnWidths: [16, 16, 12, 12, 16, 12, 10],
  };
}
