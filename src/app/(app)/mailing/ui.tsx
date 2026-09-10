"use client";

// 郵送請求の画面で共用する小さな部品（請求フォーム・税務署マスタ・納税証明書その3で使う）

// 郵送請求ツールで扱う外国人（現在の住所は請求先判断に、フリガナ・個人番号は請求書の自動入力に使う）
export interface MailingWorker {
  id: string;
  name: string;
  address: string;
  kana?: string;
  my_number?: string;
}

export const INPUT =
  "min-h-[42px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";
export const LABEL = "text-xs font-bold text-muted";

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface text-muted hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 border-b border-border py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
