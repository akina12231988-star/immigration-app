"use client";

import { useCallback, useSyncExternalStore } from "react";

// ダッシュボードのアラートを開いているか閉じているか。
// 件数が多いと画面がとても長くなるので、既定は閉じた状態にして、
// 見出し（種類と件数）だけを出す。開いたかどうかはこの端末に覚えさせる。
const KEY_PREFIX = "dashboard-alert-open:";

export function alertOpenKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

// 保存してある値から開いているかを決める。覚えが無ければ既定にしたがう
export function alertOpenFrom(raw: string | null, defaultOpen: boolean): boolean {
  if (raw === "1") return true;
  if (raw === "0") return false;
  return defaultOpen;
}

// 開閉が変わったことを、同じ画面の他のアラートにも知らせるための合図
const OPEN_EVENT = "dashboard-alert-open";

function readRaw(id: string): string | null {
  try {
    return window.localStorage.getItem(alertOpenKey(id));
  } catch {
    return null; /* localStorage が使えない環境では既定のまま */
  }
}

export function useAlertOpen(id: string, defaultOpen = false): { open: boolean; toggle: () => void } {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(OPEN_EVENT, onChange);
    return () => window.removeEventListener(OPEN_EVENT, onChange);
  }, []);
  // サーバー側では localStorage を読めないので、既定のまま描いてから読み直す
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(id),
    () => null,
  );
  const open = alertOpenFrom(raw, defaultOpen);

  const toggle = useCallback(() => {
    const next = !alertOpenFrom(readRaw(id), defaultOpen);
    try {
      window.localStorage.setItem(alertOpenKey(id), next ? "1" : "0");
    } catch {
      /* 覚えられない環境では、この場では開閉できない */
    }
    window.dispatchEvent(new Event(OPEN_EVENT));
  }, [id, defaultOpen]);

  return { open, toggle };
}
