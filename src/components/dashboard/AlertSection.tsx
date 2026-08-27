"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAlertOpen } from "@/lib/dashboard-alert-open";

// 色は文字列を組み立てず、そのまま書く（Tailwind は書いてあるクラス名しか作らないため）
const TONES = {
  seal: {
    card: "rounded-2xl border-2 border-seal bg-seal/10 p-4",
    head: "flex w-full items-center gap-2 text-left font-bold text-seal",
    sub: "shrink-0 text-xs font-bold text-seal/80",
    lead: "mb-2 mt-2 text-xs text-seal/90",
  },
  brand: {
    card: "rounded-2xl border-2 border-brand bg-brand/10 p-4",
    head: "flex w-full items-center gap-2 text-left font-bold text-brand",
    sub: "shrink-0 text-xs font-bold text-brand/80",
    lead: "mb-2 mt-2 text-xs text-brand/90",
  },
} as const;

// ダッシュボードのアラート1枠。
// 件数が多いと画面がとても長くなるので、既定は閉じておき、
// 見出し（種類と件数）だけを出す。押すと中身が開く。
// 開いたかどうかはこの端末に覚えるので、次に来たときも同じ状態になる。
export function AlertSection({
  id,
  icon,
  title,
  count,
  lead,
  tone = "seal",
  defaultOpen = false,
  children,
}: {
  id: string; // 覚えるときの名前（アラートごとに違うもの）
  icon: ReactNode;
  title: string;
  count?: number; // 「◯件」。件数が無いアラートでは省く
  lead: string; // どういうアラートかの説明（開いたときに出す）
  tone?: "seal" | "brand"; // seal = 赤（要対応）/ brand = 青（お知らせ）
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { open, toggle } = useAlertOpen(id, defaultOpen);
  const cls = TONES[tone];

  return (
    <section>
      <div className={cls.card}>
        <button type="button" onClick={toggle} aria-expanded={open} className={cls.head}>
          {icon}
          <span className="flex-1">
            {title}
            {count !== undefined && ` ${count}件`}
          </span>
          <span className={cls.sub}>{open ? "閉じる" : "開く"}</span>
          <ChevronDown
            size={18}
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <>
            <p className={cls.lead}>{lead}</p>
            {children}
          </>
        )}
      </div>
    </section>
  );
}
