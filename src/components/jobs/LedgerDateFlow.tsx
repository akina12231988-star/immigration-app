"use client";

import type { LedgerDateKind } from "@/lib/ledger-date-check";

// 求職一覧で、1人ぶんの日付の流れを棒線の上に並べて見せる。
//
//   求職受付 → 求人受付 → 紹介 → 採用 → 条件書 → 契約 → 雇用開始
//
// 入っている日付は丸を塗り、まだのところは白丸にする。
// 並びがおかしくて訂正が必要なところは赤くする（どこを直すかが一目で分かる）。

export interface LedgerDateStep {
  label: string;
  value: string; // YYYY-MM-DD（未入力は空）
  // 訂正が必要かを見るときの種類（求職受付日・求人受付年月日は訂正の対象外なので持たない）
  kind?: LedgerDateKind;
}

export function LedgerDateFlow({
  steps,
  bad,
}: {
  steps: LedgerDateStep[];
  bad: Set<LedgerDateKind>;
}) {
  return (
    // 幅の狭い画面でも流れをそのまま追えるよう、横にずらして見られるようにする
    <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <ol className="flex min-w-max items-start">
        {steps.map((s, i) => {
          const filled = Boolean(s.value);
          const wrong = Boolean(s.kind && bad.has(s.kind));
          const prevFilled = i > 0 && Boolean(steps[i - 1].value);
          return (
            <li key={s.label} className="relative flex w-[74px] shrink-0 flex-col items-center">
              {/* 前の点とつなぐ棒線。どちらも日付が入っていれば濃く出す */}
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-[6px] h-[2px] w-[74px] ${
                    filled && prevFilled ? "bg-brand/40" : "bg-border"
                  }`}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 h-[14px] w-[14px] rounded-full border-2 ${
                  wrong
                    ? "border-seal bg-seal"
                    : filled
                      ? "border-brand bg-brand"
                      : "border-border bg-surface"
                }`}
              />
              <span
                className={`mt-1 text-[10px] font-bold leading-tight ${
                  wrong ? "text-seal" : filled ? "text-foreground" : "text-muted"
                }`}
              >
                {s.label}
              </span>
              <span
                className={`text-[10px] leading-tight tabular-nums ${
                  wrong
                    ? "rounded border border-seal bg-seal/10 px-1 font-bold text-seal"
                    : "text-muted"
                }`}
              >
                {s.value ? s.value.replace(/^\d{2}/, "") : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
