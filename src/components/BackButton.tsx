"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// サイト内の「戻る」ボタン。直前に表示していた画面へ戻る（ブラウザ履歴のback）。
// 履歴がない場合（URLを直接開いた・新しいタブで開いた等）は fallbackHref へ移動する
export function BackButton({
  fallbackHref,
  className = "flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10",
}: {
  fallbackHref: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="戻る"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className}
    >
      <ArrowLeft size={20} />
    </button>
  );
}
