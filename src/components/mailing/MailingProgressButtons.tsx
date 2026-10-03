"use client";

import { mailingProgressOptionsFor, type MailingProgress } from "@/lib/tax-office";

// 記録一覧のカードで、編集を開かずに進捗（準備中／郵送待ち／完了）を押して変えるボタン。
// いまの進捗を濃く出し、押すとその進捗で保存する（同じものを押しても何もしない）
export function MailingProgressButtons({
  progress,
  requestKind,
  disabled = false,
  onChange,
}: {
  progress: MailingProgress | undefined;
  requestKind?: string;
  disabled?: boolean;
  onChange: (next: MailingProgress) => void;
}) {
  const current = progress ?? "preparing";
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="進捗">
      {mailingProgressOptionsFor(requestKind).map((o) => {
        const on = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled || on}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-[34px] px-2.5 text-[11px] font-bold disabled:cursor-default ${
              on
                ? o.value === "done"
                  ? "bg-status-approved-fg text-white"
                  : o.value === "waiting"
                    ? "bg-status-notice-fg text-white"
                    : "bg-brand text-brand-foreground"
                : "bg-background text-muted hover:bg-surface disabled:opacity-60"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
