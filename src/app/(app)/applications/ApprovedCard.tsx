"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Plus, StickyNote, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AlertBadge } from "@/components/applications/AlertBadge";
import { createClient } from "@/lib/supabase/client";
import {
  deleteApplicationMemo,
  insertApplicationMemo,
  listApplicationMemos,
} from "@/lib/supabase/queries/memos";
import { isExpiryAlert } from "@/lib/application-alerts";
import type { Application, ApplicationMemo } from "@/types/application";

// 「在留カード受け取り待ち」「在留カード新規発行済み」タブのカード。
// 詳細ページに入らなくても、受取予定日と許可通知後のメモをこの場で編集できる。
export function ApprovedCard({
  app,
  today,
  variant,
  canEdit,
  authorName,
  custodyNoLabel,
  updateApplication,
}: {
  app: Application;
  today: string;
  variant: "waiting" | "issued"; // waiting=受け取り待ち / issued=新規発行済み
  canEdit: boolean;
  authorName: string;
  custodyNoLabel: string; // 預かり番号（未預かりは「—」）
  updateApplication: (id: string, patch: Partial<Application>) => Promise<void>;
}) {
  const router = useRouter();

  // 受取予定日のインライン編集
  const [receiptOn, setReceiptOn] = useState(app.receiptScheduledOn ?? "");
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptSaved, setReceiptSaved] = useState(false);

  // 許可通知後のメモ（この場で追加・削除できる）
  const [memos, setMemos] = useState<ApplicationMemo[]>([]);
  const [memoBody, setMemoBody] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listApplicationMemos(createClient(), app.id)
      .then((m) => {
        if (!cancelled) setMemos(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [app.id]);

  // 外部（他ユーザーの更新など）で受取予定日が変わったらレンダー時に同期する
  const [prevReceipt, setPrevReceipt] = useState(app.receiptScheduledOn ?? "");
  if ((app.receiptScheduledOn ?? "") !== prevReceipt) {
    setPrevReceipt(app.receiptScheduledOn ?? "");
    setReceiptOn(app.receiptScheduledOn ?? "");
  }

  const alert = isExpiryAlert(app, today);
  const editable = canEdit && variant === "waiting";

  async function saveReceipt() {
    setReceiptSaving(true);
    try {
      await updateApplication(app.id, { receiptScheduledOn: receiptOn || undefined });
      setReceiptSaved(true);
      setTimeout(() => setReceiptSaved(false), 2000);
    } finally {
      setReceiptSaving(false);
    }
  }

  async function addMemo() {
    if (!memoBody.trim()) return;
    setMemoBusy(true);
    try {
      const memo = await insertApplicationMemo(createClient(), {
        applicationId: app.id,
        author: authorName,
        body: memoBody.trim(),
      });
      setMemos((prev) => [memo, ...prev]);
      setMemoBody("");
    } catch {
      /* 保存失敗時は入力を残す */
    } finally {
      setMemoBusy(false);
    }
  }

  async function removeMemo(id: string) {
    await deleteApplicationMemo(createClient(), id).catch(() => undefined);
    setMemos((prev) => prev.filter((m) => m.id !== id));
  }

  // カード本体クリックで詳細へ。ただし入力欄・ボタンのクリックは遷移させない。
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Card
      onClick={() => router.push(`/applications/${app.id}`)}
      className={`cursor-pointer p-4 hover:border-brand ${alert ? "border-seal" : ""}`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{app.name}</p>
          <p className="truncate text-xs text-muted">
            {app.organizationName ?? "所属機関未設定"}
          </p>
          <p className="text-xs tabular-nums text-muted">預かり番号 {custodyNoLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {alert && <AlertBadge expiry={app.residenceExpiryAtApply} />}
          <StatusBadge status={app.status} />
        </div>
      </div>

      {variant === "issued" ? (
        /* 新規発行済み: 在留許可日・受領日・カード番号を表示 */
        <div className="space-y-0.5 text-xs tabular-nums text-muted">
          <p className="flex items-center gap-1">
            <CreditCard size={12} />
            在留許可日 {app.grantedPermitDate ?? "未設定"}
          </p>
          <p>在留カード受領日 {app.cardReceivedOn ?? "未設定"}</p>
          {app.grantedCardNo && <p>在留カード番号 {app.grantedCardNo}</p>}
        </div>
      ) : editable ? (
        /* 受け取り待ち（編集可）: 受取予定日をこの場で編集 */
        <div onClick={stop} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">受取予定日</span>
            <input
              type="date"
              value={receiptOn}
              onChange={(e) => setReceiptOn(e.target.value)}
              className="min-h-[36px] rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={saveReceipt}
            disabled={receiptSaving || receiptOn === (app.receiptScheduledOn ?? "")}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-brand disabled:opacity-40"
          >
            {receiptSaved ? <Check size={14} /> : null}
            {receiptSaving ? "保存中…" : receiptSaved ? "保存しました" : "保存"}
          </button>
          {receiptOn && receiptOn <= today && (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-reported-bg px-2 py-0.5 text-[11px] font-bold text-status-reported-fg">
              受け取り可能！
            </span>
          )}
        </div>
      ) : (
        /* 受け取り待ち（閲覧のみ） */
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs tabular-nums text-muted">
            受取予定日 {app.receiptScheduledOn ?? "未設定"}
          </p>
          {app.receiptScheduledOn && app.receiptScheduledOn <= today && (
            <span className="inline-flex items-center gap-1 rounded-full bg-status-reported-bg px-2 py-0.5 text-[11px] font-bold text-status-reported-fg">
              受け取り可能！
            </span>
          )}
        </div>
      )}

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-muted">
          <StickyNote size={12} />
          許可通知後のメモ（{memos.length}）
        </p>

        {editable && (
          <div onClick={stop} className="mb-2 flex gap-2">
            <input
              value={memoBody}
              onChange={(e) => setMemoBody(e.target.value)}
              placeholder="メモを入力（受取までの経過など）"
              className="min-h-[36px] w-full rounded-lg border border-border bg-background px-2 text-sm focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={addMemo}
              disabled={memoBusy || !memoBody.trim()}
              aria-label="メモを追加"
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-bold text-brand disabled:opacity-40"
            >
              <Plus size={14} />
              追加
            </button>
          </div>
        )}

        {memos.length === 0 ? (
          <p className="text-xs text-muted">メモはありません</p>
        ) : (
          <ul className="space-y-1">
            {memos.slice(0, 3).map((m) => (
              <li key={m.id} className="rounded-lg bg-background p-2 text-xs">
                <span className="flex items-center justify-between text-[10px] text-muted">
                  <span>
                    {new Date(m.createdAt).toLocaleString("ja-JP")}
                    {m.author && ` ・ ${m.author}`}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      aria-label="メモを削除"
                      onClick={(e) => {
                        stop(e);
                        void removeMemo(m.id);
                      }}
                      className="text-seal"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
                <span className="whitespace-pre-wrap">{m.body}</span>
              </li>
            ))}
          </ul>
        )}
        {memos.length > 3 && (
          <p className="mt-1 text-[10px] text-muted">ほか{memos.length - 3}件（詳細ページで表示）</p>
        )}
      </div>
    </Card>
  );
}
