"use client";

import { CheckSquare, Square } from "lucide-react";
import type { ReactNode } from "react";

// 一覧のカードを「選ぶモード」でチェックできるようにする包み。
// 選ぶモードのときはカード全体を透明なボタンで覆い、押すと選択の切り替えになる
// （カードの中のリンクやボタンは押せなくなる）。モードでなければそのまま出す。
export function SelectableCard({
  selecting,
  selected,
  name,
  onToggle,
  children,
}: {
  selecting: boolean;
  selected: boolean;
  name: string; // 読み上げ用（「○○を選ぶ」）
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!selecting) return <>{children}</>;
  return (
    <div className={`relative rounded-2xl ${selected ? "ring-2 ring-brand" : ""}`}>
      {children}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${name}を${selected ? "選択から外す" : "選ぶ"}`}
        className="absolute inset-0 z-10 rounded-2xl bg-transparent"
      />
      <span
        className={`pointer-events-none absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg ${
          selected ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-muted"
        }`}
      >
        {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      </span>
    </div>
  );
}
