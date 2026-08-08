"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { monthLabel } from "@/lib/monthly-billing";
import { buildReceipt } from "@/lib/receipt";

// 領収書のA4印刷用シート。
// A4を縦3分割し、上から 送付状 → 切り取り線 → 領収書 → 切り取り線 → 空白 と並べる。
// 上下の切り取り線で切ると、領収書だけが1枚の紙として残る。
export function ReceiptSheet({
  orgName,
  honorific,
  month,
  invoiceNo,
  amount,
  paidOn,
  invoiceAmountExcl,
  invoiceTax,
  invoiceTaxFree,
  invoiceAmount,
}: {
  orgName: string;
  honorific: string;
  month: string;
  invoiceNo: string;
  amount: number;
  paidOn: string;
  invoiceAmountExcl: number;
  invoiceTax: number;
  invoiceTaxFree: number;
  invoiceAmount: number;
}) {
  const receipt = buildReceipt({
    orgName,
    honorific,
    month,
    invoiceNo,
    amount,
    paidOn,
    invoiceAmountExcl,
    invoiceTax,
    invoiceTaxFree,
    invoiceAmount,
  });

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/sales" />
          <h1 className="flex-1 text-lg font-bold">領収書（{orgName}）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存
          </button>
          <p className="text-xs text-muted">
            {monthLabel(month)}分の入金（{paidOn}）に対する領収書です。上から
            送付状・領収書・空白の3段で、上下の切り取り線で切ると領収書だけが残ります。
          </p>
          <p className="w-full text-[11px] text-muted">
            印刷設定は<b>用紙: A4</b>・<b>余白: なし</b>・<b>倍率: 100%</b>にしてください
            （「用紙に合わせる」だと少し小さく印刷されます）。
          </p>
        </div>
      </div>

      <div className="print-root">
        <div className="receipt-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white text-black print:mb-0 print:border-0">
          {/* 上1枠: 送付状（切り取り線から上は会社の手元に残る） */}
          <div className="receipt-cover px-[18mm] pt-[14mm]">
            <div className="flex items-start justify-between gap-6">
              <p className="min-w-0 border-b border-black pb-1 text-base font-bold">
                {receipt.addressee}
              </p>
              <div className="shrink-0 text-right text-[11px] leading-relaxed">
                <p>{receipt.issuedOn}</p>
                <p className="font-bold">{receipt.issuer.name}</p>
              </div>
            </div>
            <div className="mt-5 space-y-2 text-sm leading-relaxed">
              {receipt.coverParagraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>

          {/* 中の枠: 領収書。上辺と、下に続く空白枠の上辺が切り取り線になる */}
          <div className="receipt-body relative px-[16mm] pb-[8mm] pt-[8mm]">
            <span className="absolute -top-[1.6mm] left-[16mm] bg-white px-2 text-[10px] text-gray-500">
              ✂ 切り取り線
            </span>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="border-b border-black pb-1 text-lg font-bold">{receipt.addressee}</p>
              </div>
              <div className="shrink-0 text-right text-[11px] leading-relaxed">
                <p>発行日　{receipt.issuedOn}</p>
                {invoiceNo && <p>請求書番号　{invoiceNo}</p>}
              </div>
            </div>

            <h2 className="mt-2 text-center text-2xl font-black tracking-[0.4em]">領収書</h2>

            <div className="mt-2 flex items-end justify-center gap-3">
              <span className="text-sm font-bold">金</span>
              <span className="border-b-2 border-black px-6 pb-0.5 text-3xl font-black tabular-nums">
                {receipt.amountText}
              </span>
              <span className="text-sm font-bold">也</span>
            </div>

            {receipt.taxText && (
              <p className="mt-1 text-center text-[11px]">{receipt.taxText}</p>
            )}

            <p className="mt-2 text-center text-xs">但し　{receipt.purpose}</p>
            <p className="mt-1 text-center text-xs">上記正に領収いたしました。</p>

            <div className="mt-3 flex items-end justify-end gap-3">
              <div className="text-[11px] leading-relaxed">
                <p className="font-bold">{receipt.issuer.name}</p>
                <p>{receipt.issuer.address}</p>
                <p>
                  TEL {receipt.issuer.tel}　登録番号 {receipt.issuer.registrationNo}
                </p>
                <p>登録番号（インボイス）　{receipt.issuer.invoiceRegistrationNo}</p>
              </div>
              <div className="receipt-stamp shrink-0">
                {/* 角印（帳票内のため next/image は使わない） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/azk-stamp.png" alt={`${CUSTODIAN_INFO.officeName} 角印`} />
              </div>
            </div>
          </div>

          {/* 下の枠は空白。上辺が2本目の切り取り線 */}
          <div className="receipt-tail relative">
            <span className="absolute -top-[1.6mm] left-[16mm] bg-white px-2 text-[10px] text-gray-500">
              ✂ 切り取り線
            </span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        .receipt-sheet {
          width: 210mm;
          box-sizing: border-box;
        }
        /* A4（297mm）を縦3分割。送付状・領収書・空白がそれぞれ99mm */
        .receipt-cover,
        .receipt-body,
        .receipt-tail {
          height: 99mm;
          box-sizing: border-box;
          overflow: hidden;
        }
        /* 領収書と空白枠の上辺が切り取り線 */
        .receipt-body,
        .receipt-tail {
          border-top: 1px dashed #9ca3af;
        }
        .receipt-stamp img {
          width: 22mm;
          height: 22mm;
          object-fit: contain;
        }
        /* 印影は薄くならないよう、背景色を落とす印刷設定でもそのまま出す */
        @media print {
          .receipt-stamp img {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        @media print {
          .receipt-sheet {
            height: 297mm;
          }
        }
      `}</style>
    </>
  );
}
