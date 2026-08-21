"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// 文字をクリップボードへ写す小さなボタン（氏名の横などに置く）。
// 押すと少しの間だけチェックに変わる。クリップボードが使えない環境では何もしない
// （その場合は文字を選んでコピーしてもらう）。
export function CopyButton({
  value,
  label,
  size = 14,
  className = "",
}: {
  value: string;
  label: string; // 読み上げ・ツールチップ用（例:「氏名をコピー」）
  size?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード非対応時は何もしない */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      title={label}
      className={`shrink-0 text-muted hover:text-brand ${className}`}
    >
      {copied ? (
        <Check size={size} className="text-status-reported-fg" />
      ) : (
        <Copy size={size} />
      )}
    </button>
  );
}
