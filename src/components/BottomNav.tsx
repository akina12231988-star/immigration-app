"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { NAV_ITEMS, activeHref, type NavItem } from "@/lib/nav-items";

// 1行目に常時表示する項目数（6列目は開閉ボタン）
const PRIMARY_COUNT = 5;

// モバイル専用の下部タブ。PC ではサイドナビを使うため非表示。
// 画面を占有しすぎないよう通常は1行だけ表示し、「↑」ボタンで
// 2行目以降がスライドして開く。横スクロールはしないので、
// 画面下端のスワイプでOSのアプリ切替になってしまうことがない。
export function BottomNav() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const [open, setOpen] = useState(false);

  const primary = NAV_ITEMS.slice(0, PRIMARY_COUNT);
  const rest = NAV_ITEMS.slice(PRIMARY_COUNT);
  // 畳んでいる中に現在ページがあるときは、開閉ボタンを現在地として強調する
  const restHasActive = rest.some((item) => item.href === active);

  return (
    <nav className="sticky bottom-0 z-20 touch-pan-y overscroll-contain border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {/* 2行目以降: 開いたときだけ上へスライドして表示 */}
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? "max-h-48 border-b border-border" : "max-h-0"
        }`}
      >
        <div className="grid grid-cols-6 gap-x-0.5 gap-y-0.5 px-1 pb-1 pt-1">
          {rest.map((item) => (
            <NavTab
              key={item.href}
              item={item}
              active={active}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      </div>

      {/* 1行目: 常時表示（5項目＋開閉ボタン） */}
      <div className="grid grid-cols-6 gap-x-0.5 px-1 pb-1 pt-1">
        {primary.map((item) => (
          <NavTab key={item.href} item={item} active={active} />
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "メニューを閉じる" : "メニューをもっと見る"}
          className="flex flex-col items-center gap-0.5 py-1"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              restHasActive && !open ? "bg-brand/10" : open ? "bg-background" : ""
            }`}
          >
            {open ? (
              <ChevronDown size={20} className="text-muted" />
            ) : (
              <ChevronUp
                size={20}
                className={restHasActive ? "text-brand" : "text-muted"}
              />
            )}
          </span>
          <span
            className={`whitespace-nowrap text-[10px] font-bold ${
              restHasActive && !open ? "text-brand" : "text-muted"
            }`}
          >
            {open ? "閉じる" : "その他"}
          </span>
        </button>
      </div>
    </nav>
  );
}

function NavTab({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: string | null;
  // タブを押して移動したら2行目以降を畳むためのコールバック
  onNavigate?: () => void;
}) {
  const { href, short, icon: Icon, emphasize } = item;
  const isActive = active === href;
  return (
    <Link href={href} onClick={onNavigate} className="flex flex-col items-center gap-0.5 py-1">
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
}
