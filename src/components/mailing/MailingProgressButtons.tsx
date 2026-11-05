"use client";

import { mailingProgressChoices, mailingProgressOptionsFor, type MailingProgress, type MailingRouteSource } from "@/lib/tax-office";

// 記録一覧・詳細で、編集を開かずに進捗（準備中／代理人の発行待ち／郵送待ち／完了）を押して変えるボタン。
// いまの進捗を濃く出し、押すとその進捗で保存する（同じものを押しても何もしない）
export function MailingProgressButtons({
  progress,
  requestKind,
  record,
  disabled = false,
  onChange,
}: {
  progress: MailingProgress | undefined;
  requestKind?: string;
  // 渡すと、その記録の受け取り方（郵送／窓口）に合う進捗だけを出す
  record?: MailingRouteSource;
  disabled?: boolean;
  onChange: (next: MailingProgress) => void;
}) {
  const current = progress ?? "preparing";
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="進捗">
      {(record ? mailingProgressChoices(record, current) : mailingProgressOptionsFor(requestKind)).map((o) => {
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
                    : o.value === "agent"
                      ? "bg-brand/80 text-brand-foreground"
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
