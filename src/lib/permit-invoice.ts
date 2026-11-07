// 請求書作成の当月許可者リストに出す「許可の明細」（freee販売に登録する明細項目と金額）。
//
// 申請準備の詳細で登録した明細（未登録なら所属機関の申請種別ごとの売上明細）に、
// 許可のときに入れた実際の収入印紙代を負担のルール（lib/stamp-fee.ts の invoiceStampFee）で足す。
// 本人負担なら印紙代は入れず「印紙代は本人負担です。」を備考に出す。

import { pickEstimateChecklist } from "@/lib/estimate-summary";
import { salesKindOfPrep } from "@/lib/estimate";
import { parseAmount } from "@/lib/organization-intake";
import { salesItemsForKind, type SalesItemsSource } from "@/lib/sales";
import { invoiceStampFee, type InvoiceStampFee, type StampFeePayer } from "@/lib/stamp-fee";
import type { PrepAppType } from "@/lib/application-prep";
import type { OrgSalesItem } from "@/types/db";

export interface PermitInvoiceBrief {
  todo_no: string;
  app_content: string;
  app_type: "" | PrepAppType;
  stamp_fee_payer: string;
  updated_at: string;
  estimate_items: OrgSalesItem[] | null;
}

export interface PermitInvoiceLine {
  name: string;
  amount: number; // 税抜（印紙代は非課税）
  taxable: boolean;
  kind: "sales" | "stamp";
}

export interface PermitInvoice {
  source: "prep" | "org" | "none"; // 明細の出どころ（申請準備で登録 / 所属機関の売上明細 / 申請準備が無い）
  todoNo: string;
  payer: StampFeePayer | "";
  lines: PermitInvoiceLine[];
  stamp: InvoiceStampFee;
  notes: string[];
  total: number; // 明細の合計（税抜・非課税の合算。消費税は含めない）
}

export function buildPermitInvoice(p: {
  briefs: readonly PermitInvoiceBrief[];
  orgName: string;
  intake: (SalesItemsSource & { stamp_fee_payer?: string }) | null;
  stampFeeAmount: number | null | undefined; // 許可のときに入れた印紙代（未入力は null）
}): PermitInvoice {
  const orgDefault = p.intake?.stamp_fee_payer ?? "";
  const picked = pickEstimateChecklist(p.briefs, p.orgName, orgDefault);
  const newest = [...p.briefs].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0] ?? null;
  const checklist = picked?.checklist ?? newest;
  const payer = picked?.payer ?? "";
  const stamp = invoiceStampFee(p.stampFeeAmount, payer);

  let source: PermitInvoice["source"] = "none";
  let items: OrgSalesItem[] = [];
  if (checklist) {
    if (checklist.estimate_items) {
      source = "prep";
      items = checklist.estimate_items;
    } else if (checklist.app_content || checklist.app_type) {
      source = "org";
      items = salesItemsForKind(p.intake, salesKindOfPrep(checklist.app_content, checklist.app_type), p.orgName);
    }
  }

  const lines: PermitInvoiceLine[] = items
    .filter((r) => r.name.trim() || r.amount.trim())
    .map((r) => ({ name: r.name.trim() || "（項目名なし）", amount: parseAmount(r.amount) ?? 0, taxable: true, kind: "sales" }));
  if (stamp.billed && stamp.amount) {
    lines.push({ name: stamp.itemName, amount: stamp.amount, taxable: false, kind: "stamp" });
  }
  const notes = stamp.note ? [stamp.note] : [];
  return {
    source,
    todoNo: checklist?.todo_no ?? "",
    payer: stamp.payer,
    lines,
    stamp,
    notes,
    total: lines.reduce((n, l) => n + l.amount, 0),
  };
}

// freee販売に貼り付けやすいテキスト（1行ずつ「明細項目<TAB>金額」、最後に備考）
export function permitInvoiceText(workerName: string, inv: PermitInvoice): string {
  const rows = inv.lines.map((l) => `${workerName}さん　${l.name}\t${l.amount}${l.taxable ? "" : "\t非課税"}`);
  return [...rows, ...inv.notes].join("\n");
}
