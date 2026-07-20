"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Link2,
  MailOpen,
  Trash2,
  User,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useNotifications } from "@/lib/notification-store";
import { useApplications } from "@/lib/application-store";
import { categoryChipClass, formatRelativeTime } from "@/lib/mail-format";
import type { MailCategory } from "@/types/db";
import type { MailNotification } from "@/lib/supabase/queries/mail-notifications";

type Filter = "all" | "unread" | "許可" | "申請受付";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "unread", label: "未読" },
  { key: "許可", label: "許可" },
  { key: "申請受付", label: "申請受付" },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NotificationsClient() {
  const { notifications, unreadCount, loaded, error, markRead, markAllRead, relink, remove } =
    useNotifications();
  const { applications } = useApplications();
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 紐づけ修正用: 申請の選択肢（氏名 — 申請内容 申請日）
  const appOptions: ComboOption[] = useMemo(
    () =>
      applications
        .filter((a) => a.status !== "取下げ")
        .map((a) => ({
          id: a.id,
          label: `${a.name}${a.applicationContent ? ` — ${a.applicationContent}` : ""}（${a.applicationDate}）`,
        })),
    [applications],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "unread":
        return notifications.filter((n) => !n.isRead);
      case "許可":
      case "申請受付":
        return notifications.filter((n) => n.category === filter);
      default:
        return notifications;
    }
  }, [notifications, filter]);

  async function handleRelink(n: MailNotification, applicationId: string) {
    const app = applications.find((a) => a.id === applicationId);
    await relink(n.id, {
      applicationId: applicationId || null,
      workerId: app?.workerId ?? null,
      matchedName: app?.name ?? n.matchedName,
    });
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await remove(deleteId);
      setDeleteId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4 pt-5">
      {/* フィルタ＋一括既読 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                filter === f.key
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface text-muted hover:bg-background"
              }`}
            >
              {f.label}
              {f.key === "unread" && unreadCount > 0 && (
                <span className="ml-1 rounded-full bg-seal px-1.5 text-[11px] text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-bold text-brand hover:bg-background"
          >
            <CheckCheck size={16} />
            すべて既読
          </button>
        )}
      </div>

      {error && (
        <Card className="border-seal bg-seal/10 p-4 text-sm text-seal">{error}</Card>
      )}

      {loaded && filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-muted">
          <Bell size={32} />
          <p className="text-sm">
            {filter === "all" ? "入管メール通知はまだありません" : "該当する通知はありません"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className={`overflow-hidden p-4 ${n.isRead ? "" : "border-brand/40 bg-brand/5"}`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-seal" />}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${categoryChipClass(n.category as MailCategory)}`}
                >
                  {n.category}
                </span>
                <span className="text-xs text-muted" title={formatDateTime(n.receivedAt)}>
                  {formatRelativeTime(n.receivedAt)}
                </span>
                <span className="ml-auto text-[11px] text-muted">
                  {formatDateTime(n.receivedAt)}
                </span>
              </div>

              <p className="font-bold text-foreground">{n.subject || "（件名なし）"}</p>
              {n.fromAddress && (
                <p className="mt-0.5 truncate text-xs text-muted">{n.fromAddress}</p>
              )}
              {n.snippet && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted">{n.snippet}</p>
              )}

              {/* 紐づけ状況 */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {n.matchedApplicationId ? (
                  <Link
                    href={`/applications/${n.matchedApplicationId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 font-bold text-brand hover:bg-brand/20"
                  >
                    <User size={14} />
                    {n.matchedWorkerName ?? n.matchedName ?? "申請"}
                    {n.matchedApplicationStatus ? `（${n.matchedApplicationStatus}）` : ""}
                  </Link>
                ) : n.matchedWorkerId ? (
                  <Link
                    href={`/workers/${n.matchedWorkerId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 font-bold text-brand hover:bg-brand/20"
                  >
                    <User size={14} />
                    {n.matchedWorkerName ?? n.matchedName}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-muted">
                    <Link2 size={14} />
                    未紐づけ
                    {n.matchedName ? `（推定: ${n.matchedName}）` : ""}
                  </span>
                )}
              </div>

              {/* 紐づけ修正 */}
              {editingId === n.id && (
                <div className="mt-3 rounded-xl border border-border bg-background/50 p-3">
                  <p className="mb-1.5 text-xs font-bold text-muted">
                    紐づける申請を選択（誤検出の修正）
                  </p>
                  <Combobox
                    options={appOptions}
                    value={n.matchedApplicationId ?? ""}
                    onChange={(id) => void handleRelink(n, id)}
                    placeholder="氏名で検索"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void relink(n.id, { applicationId: null, workerId: null }).then(() =>
                          setEditingId(null),
                        )
                      }
                      className="text-xs font-bold text-muted hover:text-foreground"
                    >
                      紐づけを解除
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="ml-auto text-xs font-bold text-muted hover:text-foreground"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}

              {/* アクション */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => void markRead(n.id, !n.isRead)}
                  className="inline-flex items-center gap-1.5 text-muted hover:text-brand"
                >
                  <MailOpen size={15} />
                  {n.isRead ? "未読にする" : "既読にする"}
                </button>
                {editingId !== n.id && (
                  <button
                    type="button"
                    onClick={() => setEditingId(n.id)}
                    className="inline-flex items-center gap-1.5 text-muted hover:text-brand"
                  >
                    <Link2 size={15} />
                    紐づけ修正
                  </button>
                )}
                {n.gmailLink && (
                  <a
                    href={n.gmailLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted hover:text-brand"
                  >
                    <ExternalLink size={15} />
                    Gmailで開く
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteId(n.id)}
                  className="ml-auto inline-flex items-center gap-1.5 text-muted hover:text-seal"
                >
                  <Trash2 size={15} />
                  削除
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="通知を削除"
        message="この入管メール通知を削除します。よろしいですか？"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
