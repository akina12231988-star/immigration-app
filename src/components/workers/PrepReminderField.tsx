"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Loader2, Plus } from "lucide-react";
import type { Reminder } from "@/types/db";
import { createClient } from "@/lib/supabase/client";
import { insertReminder, listActiveReminderNos, listOpenRemindersByWorker } from "@/lib/supabase/queries/reminders";
import { formatReminderNo, nextReminderNo } from "@/lib/reminders";
import { prepAmountValue } from "@/lib/application-prep";
import { dbErrorMessage } from "@/lib/errors";

// 申請準備の書類の準備状況が「立替払い」のとき、督促（立替払い・本人から受け取る）と結びつける欄。
//   ・この書類の督促が登録済みなら、その番号と内容へのリンクを出す
//   ・まだ無ければ「督促に新規登録」で、立替払い（代わりに払う）の督促をその場で作る
// 督促の内容に書類名を入れておき、それで「この書類の督促か」を見分ける

// 督促の内容（この文に書類名が入っていれば、この書類の督促とみなす）
export function prepReminderContent(docLabel: string, todoNo: string): string {
  return `${docLabel}の未納分を立替払い（申請準備${todoNo ? ` TODO ${todoNo}` : ""}）。本人から立替分を受け取る`;
}

// この書類の督促か
export function isPrepReminderFor(r: Pick<Reminder, "content">, docLabel: string): boolean {
  return (r.content ?? "").includes(docLabel);
}

// 督促の種類（自由入力の欄。年金は保険料、納税証明書は納付書）
function prepReminderKind(docId: string): string {
  return docId === "nenkin" ? "年金保険料" : "納付書";
}

export function PrepReminderField({
  workerId,
  docId,
  docLabel,
  todoNo,
  amount,
  canEdit,
}: {
  workerId: string;
  docId: string;
  docLabel: string; // 書類名（督促の内容に入れて見分ける）
  todoNo: string; // 表示中の申請準備のTODO番号
  amount: string; // 立て替える金額（準備状況の金額欄）
  canEdit: boolean;
}) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listOpenRemindersByWorker(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setReminders(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(dbErrorMessage(err, "0144_reminders.sql", "督促を読み込めませんでした"));
      });
    return () => {
      cancelled = true;
    };
  }, [workerId, reloadKey]);

  const mine = (reminders ?? []).filter((r) => isPrepReminderFor(r, docLabel));
  const others = (reminders ?? []).length - mine.length;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const nos = await listActiveReminderNos(supabase);
      const amountNum = prepAmountValue(amount);
      await insertReminder(supabase, {
        reminder_no: nextReminderNo(nos),
        worker_id: workerId,
        kind: prepReminderKind(docId),
        content: prepReminderContent(docLabel, todoNo),
        status: "未連絡",
        contacted_on: null,
        replied_on: null,
        completed_on: null,
        note: "",
        // 当社が代わりに払う（立替払い）。金額が入っていれば内訳にも入れる
        payer: "代わり",
        advance_paid: true,
        ...(amountNum != null
          ? {
              advance_amount: amountNum,
              amount: amountNum,
              amount_items: [{ label: docLabel, amount: amountNum, due_on: null, paid_on: null, repaid_on: null }],
            }
          : {}),
      });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(dbErrorMessage(err, "0151_reminder_amount.sql", "督促を登録できませんでした"));
    } finally {
      setBusy(false);
    }
  };

  const linkCls = "inline-flex min-h-[28px] items-center gap-1 rounded-lg border px-2 text-[11px] font-bold";

  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] font-bold text-muted">
        <BellRing size={12} />
        督促（立替払い・本人から受け取る）
      </p>
      {reminders === null && !error && <p className="mt-1 text-[11px] text-muted">読み込み中…</p>}
      {mine.length > 0 && (
        <ul className="mt-1 space-y-1">
          {mine.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5">
              <Link
                href={r.reminder_no > 0 ? `/reminders?no=${r.reminder_no}` : `/reminders?worker=${workerId}`}
                className={`${linkCls} border-seal/40 bg-seal/10 text-seal`}
                title="督促の画面でこの督促を開きます"
              >
                登録済み {formatReminderNo(r.reminder_no)}
              </Link>
              <span className="text-[11px]">
                {r.status}
                {r.advance_amount != null && `・立替 ${r.advance_amount.toLocaleString("ja-JP")}円`}
                {r.advance_repaid_on && `・本人から受取済み（${r.advance_repaid_on}）`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {reminders !== null && mine.length === 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">この書類の督促はまだ登録されていません。</span>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className={`${linkCls} border-brand bg-brand text-brand-foreground disabled:opacity-50`}
              title="督促メニューに「代わりに払う（立替払い）」の督促を登録します。金額欄に入れた金額が立替の金額になります"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              督促に新規登録
            </button>
          )}
          <Link href={`/reminders?worker=${workerId}`} className={`${linkCls} border-border bg-surface text-brand`}>
            督促の画面を開く
          </Link>
        </div>
      )}
      {others > 0 && (
        <p className="mt-1 text-[11px] text-muted">
          この人のほかの進行中の督促 {others}件（
          <Link href={`/reminders?worker=${workerId}`} className="font-bold text-brand hover:underline">
            督促の画面で見る
          </Link>
          ）
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
    </div>
  );
}
