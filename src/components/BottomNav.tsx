"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, activeHref } from "@/lib/nav-items";

// モバイル専用の下部タブ（項目が多いため横スクロール可）。PC ではサイドナビを使うため非表示。
export function BottomNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex items-stretch gap-0.5 overflow-x-auto px-1">
        {NAV_ITEMS.map(({ href, short, icon: Icon, emphasize }) => {
          const isActive = active === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex min-w-[4.2rem] flex-1 shrink-0 flex-col items-center gap-1 py-2"
            >
              <span
                className={
                  emphasize
                    ? "-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-md"
                    : `flex h-9 w-9 items-center justify-center rounded-full ${
                        isActive ? "bg-brand/10" : ""
                      }`
                }
              >
                <Icon
                  size={emphasize ? 22 : 20}
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
