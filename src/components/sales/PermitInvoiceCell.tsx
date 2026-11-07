"use client";

import Link from "next/link";
import { CopyButton } from "@/components/ui/CopyButton";
import { estimateHref } from "@/lib/estimate-summary";
import { prepDetailHref } from "@/lib/application-prep";
import type { PermitInvoice } from "@/lib/permit-invoice";
import { permitInvoiceText } from "@/lib/permit-invoice";
import { stampFeePayerLabel } from "@/lib/stamp-fee";

// 当月許可者リストの「許可の明細」の1マス。
// 申請準備で登録した明細（未登録なら所属機関の売上明細）と、許可のときに入れた収入印紙代を
// 明細項目ごとに出し、freee販売に貼り付けられるようにコピーできる
export function PermitInvoiceCell({
  workerId,
  workerName,
  invoice: inv,
  stampColumnReady,
}: {
  workerId: string;
  workerName: string;
  invoice: PermitInvoice;
  stampColumnReady: boolean; // 印紙代の列（0213）が読めたか
}) {
  if (inv.source === "none") {
    return (
      <td className="py-1.5 pr-2 align-top text-[11px] text-muted">
        申請準備の明細なし
        <Link href={prepDetailHref(workerId)} className="ml-1 font-bold text-brand underline">
          申請準備へ
        </Link>
      </td>
    );
  }
  const stampWarn =
    !stampColumnReady
      ? "印紙代の列が未作成（0213）"
      : inv.stamp.state === "unknown_amount"
        ? "印紙代が未入力（申請詳細で入れる）"
        : inv.stamp.state === "unknown_payer"
          ? `印紙代 ${inv.stamp.amount?.toLocaleString()}円の負担が未設定`
          : "";
  return (
    <td className="min-w-[260px] py-1.5 pr-2 align-top">
      <ul className="space-y-0.5 text-[11px]">
        {inv.lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              {l.name}
              {!l.taxable && <span className="ml-1 text-[10px] text-muted">非課税</span>}
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
              {l.amount.toLocaleString()}円
              <CopyButton value={String(l.amount)} label={`${l.name}の金額をコピー`} size={11} />
            </span>
          </li>
        ))}
      </ul>
      {inv.notes.map((n) => (
        <p key={n} className="mt-0.5 text-[11px] font-bold text-brand">
          備考: {n}
        </p>
      ))}
      {stampWarn && <p className="mt-0.5 text-[11px] font-bold text-seal">{stampWarn}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted">
        <span>
          {inv.source === "prep" ? "申請準備で登録した明細" : "所属機関の売上明細（申請準備で未登録）"}
          {inv.payer && `・印紙代 ${stampFeePayerLabel(inv.payer)}`}
        </span>
        <CopyButton value={permitInvoiceText(workerName, inv)} label="明細をまとめてコピー" size={11} />
        {inv.todoNo && (
          <Link href={estimateHref(workerId, inv.todoNo)} className="font-bold text-brand underline">
            見積書
          </Link>
        )}
      </div>
    </td>
  );
}
