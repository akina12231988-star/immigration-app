"use client";

import { Printer } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import type { ReminderWithWorker } from "@/lib/supabase/queries/reminders";
import {
  amountItemsProgressText,
  dueLabel,
  formatReminderNo,
  normalizeAmountItems,
  payerLabel,
  reminderAmount,
  reminderPayer,
  repaymentLabel,
  type ReminderFilter,
} from "@/lib/reminders";

const yen = (n: number | null | undefined) => (n == null ? "" : `${n.toLocaleString("ja-JP")}円`);

// 督促の一覧表の印刷用（A4横）。画面の一覧表と同じ列に、内訳ごとの支払・受取の状態も添える
export function ReminderListPrintView({
  rows,
  filter,
  q,
  today,
}: {
  rows: ReminderWithWorker[];
  filter: ReminderFilter;
  q: string;
  today: string;
}) {
  const total = rows.reduce((a, r) => a + (reminderAmount(r) ?? 0), 0);
  return (
    <>
      {/* A4横。1枚に多く載せるため余白は小さめ */}
      <style>{"@media print{@page{size:A4 landscape;margin:8mm} body{background:#fff}}"}</style>

      <div className="print:hidden">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-brand px-4 py-3 text-brand-foreground lg:px-8">
          <BackButton fallbackHref="/reminders" />
          <h1 className="flex-1 text-lg font-bold">督促の一覧表（A4横で印刷）</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 lg:px-8">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground"
          >
            <Printer size={18} />
            印刷・PDF保存（A4横）
          </button>
          <span className="text-[11px] leading-relaxed text-muted">
            督促の一覧表で表示していた分（絞り込み「{filter}」{q && `・検索「${q}」`}）のうち、支払いのある督促 {rows.length}件を出しています。
            印刷の設定で用紙は「A4」、向きは「横」、拡大縮小は「用紙に合わせる」にしてください。PDFで残すときは送信先を「PDFに保存」にしてください。
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 pb-6 lg:px-8 print:max-w-none print:p-0">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-bold print:text-[14px]">督促 一覧表（{filter}{q && `・「${q}」`}）</h2>
          <p className="text-[11px] text-muted print:text-[9px]">
            {today} 現在 ・ {rows.length}件 ・ 金額の合計 {yen(total)}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted">支払いのある督促はありません。</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-[11px] print:text-[9px]">
            {/* 列幅を固定して、内容の長さで列が潰れないようにする（合計 100%） */}
            <colgroup>
              {[7.5, 3, 11, 15, 7, 20, 9.5, 6.5, 8, 5.5, 7].map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-background print:bg-[#eee]">
                {["作成日", "No.", "名前", "種類・内容", "金額（合計）", "内訳（金額・期限・支払/受取）", "支払期限", "支払", "返金確認", "進捗", "連絡/返事"].map((h) => (
                  <th key={h} className="border border-border px-1.5 py-1 text-left font-bold print:border-[#999]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const items = normalizeAmountItems(r.amount_items);
                const payer = reminderPayer(r);
                const rep = repaymentLabel(r);
                const due = dueLabel(r.due_on, today, r.status);
                const cell = "border border-border px-1.5 py-1 align-top print:border-[#999]";
                return (
                  <tr key={r.id} className="break-inside-avoid">
                    <td className={`${cell} tabular-nums`}>{r.created_at.slice(0, 10)}</td>
                    <td className={`${cell} tabular-nums`}>{formatReminderNo(r.reminder_no).replace("No.", "")}</td>
                    <td className={`${cell} break-words`}>
                      <span className="font-bold">{r.workers?.name ?? "（外国人不明）"}</span>
                      {r.workers?.organizations?.name && <span className="block text-[10px] text-muted print:text-[8px]">{r.workers.organizations.name}</span>}
                    </td>
                    <td className={cell}>
                      {r.kind}
                      {r.content && <span className="block">{r.content}</span>}
                    </td>
                    <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{yen(reminderAmount(r)) || "—"}</td>
                    <td className={cell}>
                      {items.length === 0 ? (
                        "—"
                      ) : (
                        <>
                          {items.map((it, i) => (
                            <span key={i} className="block">
                              {it.label && `${it.label} `}
                              {yen(it.amount)}
                              {it.due_on && `（期限 ${it.due_on}）`}
                              {it.paid_on ? `　支払 ${it.paid_on}` : "　未払い"}
                              {payer === "代わり" && it.paid_on && (it.repaid_on ? `／受取 ${it.repaid_on}` : "／未受取")}
                            </span>
                          ))}
                          {items.length > 1 && (
                            <span className="block font-bold">{amountItemsProgressText(items, payer)}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`${cell} tabular-nums ${due.overdue ? "font-bold text-seal" : ""}`}>
                      {due.text ? due.text.replace(/^期限 /, "") : "—"}
                    </td>
                    <td className={cell}>{payerLabel(r) || "—"}</td>
                    <td className={`${cell} ${rep.unpaid ? "font-bold text-seal" : ""}`}>
                      {rep.text ? (rep.unpaid ? `未返金${r.advance_paid_on ? `（支払 ${r.advance_paid_on}）` : ""}` : rep.text) : "—"}
                    </td>
                    <td className={cell}>{r.status}</td>
                    <td className={`${cell} tabular-nums`}>
                      {r.contacted_on && `連絡 ${r.contacted_on}`}
                      {r.replied_on && <span className="block">返事 {r.replied_on}</span>}
                      {r.completed_on && <span className="block">完了 {r.completed_on}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
