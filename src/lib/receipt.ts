// 領収書（入金いただいた分の受領書）の中身を組み立てる。
// 請求・入金の記録に入金日を書くと、その月の入金に対して1枚発行できる。
// 用紙はA4を縦3分割した1枚分（上から1つ目）に収める。

import { CUSTODIAN_INFO } from "@/lib/custody";
import { monthLabel } from "@/lib/monthly-billing";

export interface ReceiptInput {
  orgName: string; // 宛名（所属機関名）
  honorific: string; // 敬称（様 / 御中）
  month: string; // 対象月 YYYY-MM
  invoiceNo: string; // 請求書番号（控えとして載せる）
  amount: number; // 領収金額（入金済み額）
  paidOn: string; // 入金日（＝発行日）YYYY-MM-DD
}

export interface Receipt {
  addressee: string; // 「◯◯◯ 御中」
  amount: number;
  amountText: string; // 「¥55,000-」
  purpose: string; // 但し書き
  issuedOn: string; // 「2026年8月7日」
  issuer: {
    name: string;
    address: string;
    tel: string;
    registrationNo: string;
  };
}

// 領収金額の表記（「¥55,000-」）
export function receiptAmountText(amount: number): string {
  return `¥${Math.max(amount, 0).toLocaleString("ja-JP")}-`;
}

// "2026-08-07" → "2026年8月7日"
export function receiptDateText(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : dateStr;
}

export function buildReceipt(input: ReceiptInput): Receipt {
  return {
    addressee: `${input.orgName}　${input.honorific}`,
    amount: input.amount,
    amountText: receiptAmountText(input.amount),
    purpose: `${monthLabel(input.month)}分 支援費として`,
    issuedOn: receiptDateText(input.paidOn),
    issuer: {
      name: `登録支援機関 ${CUSTODIAN_INFO.officeName}`,
      address: CUSTODIAN_INFO.address,
      tel: CUSTODIAN_INFO.tel,
      registrationNo: CUSTODIAN_INFO.registrationNo,
    },
  };
}

export function receiptFileName(orgName: string, month: string): string {
  return `領収書_${orgName}_${monthLabel(month)}`;
}
