"use client";

import { useEffect, useState } from "react";
import { LATEST_RELEASE_DATE, unreadReleaseNotes } from "@/lib/release-notes";

// 「更新のお知らせ」をどこまで読んだかは、この端末（ブラウザ）に覚えさせる。
// 人によって読むタイミングが違うので、DBには持たせない。
export const READ_KEY = "release-notes-read-at";
const KEY = READ_KEY;

export function readReleaseNotes(): void {
  try {
    window.localStorage.setItem(KEY, LATEST_RELEASE_DATE);
    window.dispatchEvent(new Event("release-notes-read"));
  } catch {
    /* localStorage が使えない環境では何もしない */
  }
}

// 未読の件数（ナビのバッジ用）
export function useUnreadReleaseCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const apply = () => {
      let lastRead = "";
      try {
        lastRead = window.localStorage.getItem(KEY) ?? "";
      } catch {
        lastRead = "";
      }
      setCount(unreadReleaseNotes(lastRead).length);
    };
    apply();
    window.addEventListener("release-notes-read", apply);
    return () => window.removeEventListener("release-notes-read", apply);
  }, []);
  return count;
}
