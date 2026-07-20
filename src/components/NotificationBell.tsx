"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, MailOpen } from "lucide-react";
import { useNotifications } from "@/lib/notification-store";
import { categoryChipClass, formatRelativeTime } from "@/lib/mail-format";

// ヘッダー／サイドナビに置く通知ベル。未読バッジ＋クリックで新着一覧のドロップダウン。
export function NotificationBell({
  align = "right",
  tone = "light",
}: {
  align?: "left" | "right";
  tone?: "light" | "dark";
}) {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const recent = notifications.slice(0, 8);
  const buttonColor =
    tone === "dark"
      ? "hover:bg-brand-foreground/10"
      : "hover:bg-background text-foreground";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`入管メール通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ""}`}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition ${buttonColor}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-seal px-1 text-[10px] font-black leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-11 z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-bold text-foreground">入管メール通知</span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-brand"
            >
              すべて見る
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-muted">
              <MailOpen size={28} />
              <p className="text-sm">新着メールはありません</p>
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {recent.map((n) => {
                const href = n.matchedApplicationId
                  ? `/applications/${n.matchedApplicationId}`
                  : "/notifications";
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      onClick={() => {
                        if (!n.isRead) void markRead(n.id, true);
                        setOpen(false);
                      }}
                      className={`flex items-start gap-2 px-4 py-3 transition hover:bg-background ${
                        n.isRead ? "" : "bg-brand/5"
                      }`}
                    >
                      {!n.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-seal" />
                      )}
                      <div className={`min-w-0 flex-1 ${n.isRead ? "pl-4" : ""}`}>
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryChipClass(n.category)}`}
                          >
                            {n.category}
                          </span>
                          <span className="text-[11px] text-muted">
                            {formatRelativeTime(n.receivedAt)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-bold text-foreground">
                          {n.subject || "（件名なし）"}
                        </p>
                        {(n.matchedWorkerName ?? n.matchedName) && (
                          <p className="truncate text-xs text-muted">
                            {n.matchedWorkerName ?? n.matchedName}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
