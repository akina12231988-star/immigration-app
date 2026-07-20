"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, activeHref } from "@/lib/nav-items";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotifications } from "@/lib/notification-store";

// PC専用の左サイドナビ（lg 以上で表示）。モバイルは下部タブを使う。
export function SideNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const { unreadCount } = useNotifications();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex print:!hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-brand text-sm font-black text-brand">
          入管
        </span>
        <div className="leading-tight">
          <p className="text-[11px] font-medium text-muted">登録支援機関</p>
          <p className="text-sm font-bold">業務管理システム</p>
        </div>
        <div className="ml-auto">
          <NotificationBell tone="light" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = active === href;
          const showBadge = href === "/notifications" && unreadCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                isActive
                  ? "bg-brand text-brand-foreground"
                  : "text-foreground hover:bg-background"
              }`}
            >
              <Icon size={19} className={isActive ? "" : "text-muted"} />
              {label}
              {showBadge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-seal px-1.5 text-[11px] font-black text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <DarkModeToggle />
        <LogoutButton />
      </div>
    </aside>
  );
}
