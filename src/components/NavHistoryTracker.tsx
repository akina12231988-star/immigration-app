"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pushNavHistory } from "@/lib/nav-history";

// 表示した画面のURLを履歴に積む（「戻る」ボタンが1つ前の画面へ戻れるようにする）。
// ログイン後の共通レイアウトに1つだけ置く
export function NavHistoryTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  useEffect(() => {
    pushNavHistory(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);
  return null;
}
