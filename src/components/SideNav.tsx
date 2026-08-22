"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  NAV_ENTRIES,
  activeHref,
  isNavGroup,
  type NavItem,
} from "@/lib/nav-items";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotifications } from "@/lib/notification-store";
import { useUnreadReleaseCount } from "@/lib/release-notes-read";
import { useNavAlerts, type NavAlerts } from "@/lib/nav-alerts";

// メニュー項目に出すバッジ件数（未読・アラート）
function badgeFor(
  item: NavItem,
  counts: { unread: number; unreadUpdates: number; alerts: NavAlerts },
): number {
  if (item.href === "/notifications") return counts.unread;
  if (item.href === "/updates") return counts.unreadUpdates;
  if (item.alert === "passports") return counts.alerts.passports;
  if (item.alert === "orientations") return counts.alerts.orientations;
  return 0;
}

// PC専用の左サイドナビ（md 以上＝ブラウザ幅768px以上で表示）。モバイルは下部タブを使う。
// TODO・あっせんはトグルで開閉できる（現在地が中にあるときは自動で開く）
export function SideNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const { unreadCount } = useNotifications();
  // 新機能のお知らせの未読件数（この端末で「更新のお知らせ」を開くと消える）
  const unreadUpdates = useUnreadReleaseCount();
  // パスポート更新必要・要実施の生活オリエンのアラート件数
  const alerts = useNavAlerts();
  const counts = { unread: unreadCount, unreadUpdates, alerts };

  // トグルの開閉（ユーザーが触った分だけ覚える。未操作なら現在地が中にあるとき開く）
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const itemRow = (item: NavItem, indent = false) => {
    const isActive = active === item.href;
    const badge = badgeFor(item, counts);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
          indent ? "ml-4" : ""
        } ${isActive ? "bg-brand text-brand-foreground" : "text-foreground hover:bg-background"}`}
      >
        <Icon size={19} className={isActive ? "" : "text-muted"} />
        {item.label}
        {badge > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-seal px-1.5 text-[11px] font-black text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex print:!hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand text-sm font-black text-brand">
          入管
        </span>
        <div className="leading-tight">
          <p className="text-[11px] font-medium text-muted">登録支援機関</p>
          <p className="text-sm font-bold">業務管理システム</p>
        </div>
        <div className="ml-auto">
          {/* サイドナビは画面左端にあるため、ドロップダウンは右方向に開く */}
          <NotificationBell tone="light" align="left" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_ENTRIES.map((entry) => {
          if (!isNavGroup(entry)) return itemRow(entry);

          const childActive = entry.children.some((c) => c.href === active);
          const open = openGroups[entry.key] ?? childActive;
          const groupBadge = entry.children.reduce((s, c) => s + badgeFor(c, counts), 0);
          const Icon = entry.icon;
          return (
            <div key={entry.key}>
              <button
                type="button"
                onClick={() => setOpenGroups((g) => ({ ...g, [entry.key]: !open }))}
                aria-expanded={open}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  childActive && !open
                    ? "bg-brand/10 text-brand"
                    : "text-foreground hover:bg-background"
                }`}
              >
                <Icon size={19} className={childActive ? "text-brand" : "text-muted"} />
                {entry.label}
                {!open && groupBadge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-seal px-1.5 text-[11px] font-black text-white">
                    {groupBadge > 99 ? "99+" : groupBadge}
                  </span>
                )}
                <span className={groupBadge > 0 && !open ? "" : "ml-auto"}>
                  {open ? (
                    <ChevronDown size={16} className="text-muted" />
                  ) : (
                    <ChevronRight size={16} className="text-muted" />
                  )}
                </span>
              </button>
              {open && entry.children.map((c) => itemRow(c, true))}
            </div>
          );
        })}
      </nav>

      <div className="flex items-center justify-end border-t border-border px-4 py-3">
        <LogoutButton />
      </div>
    </aside>
  );
}
