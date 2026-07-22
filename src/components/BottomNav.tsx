"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, activeHref } from "@/lib/nav-items";

// モバイル専用の下部タブ。PC ではサイドナビを使うため非表示。
// 全項目を2段のグリッドで表示する（横スクロールなし）。
// スライド操作が不要なので、画面下端のスワイプでOSのアプリ切替になってしまうことがない。
export function BottomNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <nav className="sticky bottom-0 z-20 touch-pan-y overscroll-contain border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      <div className="grid grid-cols-6 gap-x-0.5 gap-y-0.5 px-1 pb-1 pt-1">
        {NAV_ITEMS.map(({ href, short, icon: Icon, emphasize }) => {
          const isActive = active === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 py-1"
            >
              <span
                className={
                  emphasize
                    ? "flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-md"
                    : `flex h-9 w-9 items-center justify-center rounded-full ${
                        isActive ? "bg-brand/10" : ""
                      }`
                }
              >
                <Icon
                  size={20}
                  className={emphasize ? "" : isActive ? "text-brand" : "text-muted"}
                />
              </span>
              <span
                className={`whitespace-nowrap text-[10px] font-bold ${
                  isActive ? "text-brand" : "text-muted"
                }`}
              >
                {short}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
