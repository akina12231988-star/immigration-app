"use client";

import { useSyncExternalStore } from "react";

// 申請準備の詳細の見出し（外国人の名前の横）に出す申請種別。
// 申請種別は画面の中のチェックリスト（ApplicationPrepChecklist）が表示中のTODOの分を知っているので、
// そこから publishPrepAppContent で知らせてもらい、選び直したときもすぐ見出しに反映する。
// 値: null = まだ分からない（読み込み中・TODOが無い）／"" = 未選択／それ以外 = 申請種別の言い方
const values = new Map<string, string | null>();
const listeners = new Set<() => void>();

export function publishPrepAppContent(workerId: string, label: string | null): void {
  if (values.get(workerId) === label) return;
  values.set(workerId, label);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function PrepAppContentBadge({ workerId }: { workerId: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => values.get(workerId) ?? null,
    () => null,
  );
  if (label == null) return null;
  return (
    <span
      className={`ml-2 inline-block rounded-full border px-2.5 py-0.5 align-middle text-xs font-bold ${
        label ? "border-brand-foreground/70 bg-brand-foreground text-brand" : "border-brand-foreground/50 text-brand-foreground/80"
      }`}
      title="申請種別（申請準備の「申請種別」で選んだ内容）"
    >
      {label || "申請種別 未選択"}
    </span>
  );
}
