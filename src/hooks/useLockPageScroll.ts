"use client";

import { useEffect } from "react";

// 画面いっぱいの重ねた画面（記入位置の画面など）を開いている間、下の画面がスクロールしないよう止め、
// 閉じたら開く前の位置に戻す（中でページへ移ったり矢印キーを押したりしても、下の画面が一番上へ飛ばないように）
export function useLockPageScroll(): void {
  useEffect(() => {
    const y = window.scrollY;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
      window.scrollTo(0, y);
      // 閉じた直後に下の画面の高さが変わっても、開く前の位置に戻す
      requestAnimationFrame(() => window.scrollTo(0, y));
    };
  }, []);
}
