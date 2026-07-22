"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Copy, ExternalLink, MessageCircle, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { updateWorker } from "@/lib/supabase/queries/workers";
import { remainingLabel, daysUntil } from "@/lib/worker-alerts";
import { notionAppUrl } from "@/lib/notion-link";
import {
  RESIDENCE_RENEWAL_STATUSES,
  type ResidenceRenewalStatus,
  type Worker,
} from "@/types/db";

export const RENEWAL_STATUS_LABEL: Record<ResidenceRenewalStatus, string> = {
  "": "未対応",
  準備中: "準備中",
  審査中: "審査中",
  転職先にて対応中: "転職先にて対応中",
  他登録支援機関にて対応中: "他登録支援機関にて対応中",
  帰国: "帰国",
};

const STATUS_CLASS: Record<ResidenceRenewalStatus, string> = {
  "": "bg-seal/10 text-seal",
  準備中: "bg-status-applied-bg text-status-applied-fg",
  審査中: "bg-brand/10 text-brand",
  転職先にて対応中: "bg-status-notice-bg text-status-notice-fg",
  他登録支援機関にて対応中: "bg-status-notice-bg text-status-notice-fg",
  帰国: "bg-background text-muted",
};

// 在留更新対象の1件を表示・編集するカード（在留更新対象ページと外国人管理で共用）
export function WorkerRenewalCard({
  worker,
  orgName,
  today,
  canEdit,
}: {
  worker: Worker;
  orgName?: string | null;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [todo, setTodo] = useState(worker.residence_renewal_todo ?? "");
  const [status, setStatus] = useState<ResidenceRenewalStatus>(worker.residence_renewal_status);
  const [notionLink, setNotionLink] = useState(worker.notion_link ?? "");
  const [messengerLink, setMessengerLink] = useState(worker.messenger_link ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(worker.name);
      setNameCopied(true);
      setTimeout(() => setNameCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  const expiry = worker.residence_expiry_date ?? "";
  const days = expiry ? daysUntil(expiry, today) : 0;
  const overdue = days < 0;

  const onTodoChange = (v: string) => {
    setTodo(v);
    setSaved(false);
    if (v.trim() && status === "") setStatus("準備中");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateWorker(createClient(), worker.id, {
        residence_renewal_todo: todo.trim(),
        residence_renewal_status: status,
        notion_link: notionLink.trim(),
        messenger_link: messengerLink.trim(),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "min-h-[40px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

  return (
    <Card className={`p-4 ${status === "" && overdue ? "border-seal" : ""}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* クリックしても遷移せず、選択・コピーできるように通常テキストにする */}
            <p className="select-text truncate font-bold">{worker.name}</p>
            <button
              type="button"
              onClick={copyName}
              aria-label="氏名をコピー"
              className="shrink-0 text-muted hover:text-brand"
            >
              {nameCopied ? <Check size={14} className="text-status-reported-fg" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="truncate text-xs text-muted">
            {orgName ?? "所属機関未設定"}
            {worker.nationality && ` ・ ${worker.nationality}`}
            {worker.residence_status && ` ・ ${worker.residence_status}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASS[status]}`}>
          {RENEWAL_STATUS_LABEL[status]}
        </span>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted">
        <span className="flex items-center gap-1">
          <CalendarClock size={12} />
          在留期限 {expiry || "未登録"}
        </span>
        {expiry && (
          <span className={`font-bold ${overdue ? "text-seal" : "text-status-applied-fg"}`}>
            （{remainingLabel(expiry, today)}）
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        <Link href={`/workers/${worker.id}`} className="flex items-center gap-1 text-xs font-bold text-brand">
          <UserRound size={13} />
          外国人情報
        </Link>
        {worker.messenger_link && (
          <a href={worker.messenger_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-brand">
            <MessageCircle size={13} />
            Messenger
          </a>
        )}
        {worker.notion_link && (
          <a href={notionAppUrl(worker.notion_link)} className="flex items-center gap-1 text-xs font-bold text-brand">
            <ExternalLink size={13} />
            Notionを開く
          </a>
        )}
      </div>

      {canEdit && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {error && <p className="rounded-lg bg-seal/10 px-2.5 py-1.5 text-xs text-seal">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">Notion 申請TODO番号</span>
            <input
              value={todo}
              onChange={(e) => onTodoChange(e.target.value)}
              placeholder="例: TODO-1234"
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">対応状況</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ResidenceRenewalStatus);
                setSaved(false);
              }}
              className={INPUT}
            >
              {RESIDENCE_RENEWAL_STATUSES.map((s) => (
                <option key={s || "pending"} value={s}>
                  {RENEWAL_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {/* メッセンジャー未登録なら、この画面で入力して登録できる（登録済みなら上にリンク表示） */}
          {!worker.messenger_link && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">Messenger リンク（未登録）</span>
              <input
                type="url"
                value={messengerLink}
                onChange={(e) => {
                  setMessengerLink(e.target.value);
                  setSaved(false);
                }}
                placeholder="https://m.me/... または https://www.messenger.com/..."
                className={INPUT}
              />
            </label>
          )}
          {/* Notion未登録なら、この画面で入力して登録できる（登録済みなら上にリンク表示） */}
          {!worker.notion_link && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-muted">Notion 個人ページのリンク（未登録）</span>
              <input
                type="url"
                value={notionLink}
                onChange={(e) => {
                  setNotionLink(e.target.value);
                  setSaved(false);
                }}
                placeholder="https://www.notion.so/... または https://app.notion.com/..."
                className={INPUT}
              />
            </label>
          )}
          <Button fullWidth disabled={busy} onClick={save}>
            {busy ? "保存中…" : saved ? "保存しました" : "保存する"}
          </Button>
        </div>
      )}
    </Card>
  );
}
