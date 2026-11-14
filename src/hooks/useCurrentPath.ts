"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// 今の画面のパス＋クエリ（例: /workers/1/application-prep?todo=2）。サーバー描画中は ""
export function useCurrentPath(): string {
  return useSyncExternalStore(
    noop,
    () => `${window.location.pathname}${window.location.search}`,
    () => "",
  );
}
