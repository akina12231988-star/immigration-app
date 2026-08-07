"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { formatSalesYen } from "@/lib/sales";
import { monthLabel } from "@/lib/monthly-billing";
import { buildReminderLetter, type ReminderInvoiceRow } from "@/lib/reminder-letter";

// 督促状（未入金のお支払いのご確認）のA4印刷用シート。
// 用紙の上3分の2に文面と一覧表を収め、残りの3分の1は空白にして
// 切り取り線から切り離して捨てられるようにする。
export function ReminderSheet({
  orgName,
  honorific,
  month,
  issuedOn,
  unpaid,
  current,
}: {
  orgName: string;
  honorific: string;
  month: string;
  issuedOn: string;
  unpaid: ReminderInvoiceRow[];
  current: ReminderInvoiceRow | null;
}) {
  const letter = buildReminderLetter({ orgName, honorific, issuedOn, unpaid, current });

  return (
    <>
      {/* 画面用ツールバー（印刷時は非表示） */}
      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/sales" />
          <h1 className="flex-1 text-lg font-bold">督促状（{orgName}）</h1>
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
            {monthLabel(month)}分までの請求をまとめています。用紙の下3分の1は空白です（切り取り線から切り離して捨てられます）。
          </p>
        </div>
        {unpaid.length === 0 && (
          <p className="mx-4 mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal lg:mx-8">
            残額が残っている過去の請求がありません。今回のご請求分だけの一覧になります。
          </p>
        )}
      </div>

      <div className="print-root">
        <div className="reminder-sheet mx-auto mb-6 max-w-[210mm] border border-border bg-white text-black print:mb-0 print:border-0">
          {/* 上3分の2: 文面と一覧表 */}
          <div className="reminder-body px-[18mm] pt-[16mm]">
            <p className="text-right text-xs">発行年月日　{letter.issuedOn}</p>

            <p className="mt-2 text-lg font-bold">{letter.addressee}</p>

            <div className="mt-4 text-right text-sm leading-relaxed">
              {letter.sender.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm font-bold">【ご確認のお願い】</p>
              <p className="text-xl font-black tracking-wide">{letter.title}</p>
            </div>

            <div className="mt-6 space-y-2 text-sm leading-relaxed">
              {letter.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>

            <table className="mt-5 w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <Th>請求日</Th>
                  <Th>請求書番号</Th>
                  <Th align="right">請求金額</Th>
                  <Th align="right">入金済み額</Th>
                  <Th align="right">ご請求額（残額）</Th>
                  <Th>支払期限</Th>
                  <Th align="center">区分</Th>
                </tr>
              </thead>
              <tbody>
                {letter.rows.map((r) => (
                  <tr key={`${r.billedOn}-${r.invoiceNo}`}>
                    <Td>{r.billedOn}</Td>
                    <Td>{r.invoiceNo || "—"}</Td>
                    <Td align="right">{formatSalesYen(r.amount)}</Td>
                    <Td align="right">{r.paid > 0 ? formatSalesYen(r.paid) : ""}</Td>
                    <Td align="right">
                      <span className="font-bold">{formatSalesYen(r.remaining)}</span>
                    </Td>
                    <Td>{r.dueOn}</Td>
                    <Td align="center">{r.kind}</Td>
                  </tr>
                ))}
                <tr className="bg-gray-100">
                  <Td colSpan={4}>
                    <span className="font-bold">参考合計（未入金分＋今回ご請求分）</span>
                  </Td>
                  <Td align="right">
                    <span className="text-sm font-black">{formatSalesYen(letter.total)}</span>
                  </Td>
                  <Td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>

          {/* 切り取り線から下は空白（切り離して捨てられる） */}
          <div className="reminder-cut relative">
            <div className="border-t border-dashed border-gray-400" />
            <span className="absolute -top-2 left-[18mm] bg-white px-2 text-[10px] text-gray-500">
              ✂ ここから下は切り取ってお捨てください
            </span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 0;
        }
        .reminder-sheet {
          width: 210mm;
          box-sizing: border-box;
        }
        /* 用紙の上3分の2（198mm）に文面と一覧表を収める */
        .reminder-body {
          height: 198mm;
          box-sizing: border-box;
          overflow: hidden;
        }
        @media print {
          .reminder-sheet {
            height: 297mm;
          }
        }
      `}</style>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className="border border-gray-400 px-1.5 py-1 font-bold"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      className="border border-gray-400 px-1.5 py-1 tabular-nums"
      style={{ textAlign: align }}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
