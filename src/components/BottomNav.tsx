"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, List, ScanLine, PlusCircle, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/applications", label: "申請", icon: List },
  { href: "/applications/new", label: "登録", icon: PlusCircle, emphasize: true },
  { href: "/workers", label: "外国人", icon: Users },
  { href: "/notices/search", label: "通知書", icon: ScanLine },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, emphasize }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              <span
                className={
                  emphasize
                    ? "flex h-11 w-11 items-center justify-center rounded-full bg-brand text-brand-foreground -mt-4 shadow-md"
                    : `flex h-11 w-11 items-center justify-center rounded-full ${
                        active ? "bg-brand/10" : ""
                      }`
                }
              >
                <Icon
                  size={emphasize ? 24 : 22}
                  className={
                    emphasize
                      ? ""
                      : active
                      ? "text-brand"
                      : "text-muted"
                  }
                />
              </span>
              <span
                className={`text-[11px] font-bold ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
