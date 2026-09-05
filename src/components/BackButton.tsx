"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// 戻れなかったと判断するまでの待ち時間（ブラウザの戻る処理が終わるのを少し待つ）
const BACK_TIMEOUT_MS = 400;

// サイト内の「戻る」ボタン。直前に表示していた画面へ戻る（ブラウザ履歴のback）。
// 新しいタブで開いた画面（印刷用のページなど）やURLを直接開いたときは戻る先が無いので、
// fallbackHref へ移動する。
// ブラウザによっては新しいタブでも history.length が2以上になり、戻るを押しても
// 何も起きないことがあるため、少し待っても画面が変わらなければ fallbackHref へ移動する。
export function BackButton({
  fallbackHref,
  className = "flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-foreground/10",
}: {
  fallbackHref: string;
  className?: string;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 画面を離れるときは待ちを止める（戻れたときに二重で移動しないように）
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-label="戻る"
      onClick={() => {
        if (window.history.length <= 1) {
          router.push(fallbackHref);
          return;
        }
        const before = window.location.href;
        router.back();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          // 戻る先が無くてURLが変わらないときは、決めておいた画面へ移動する
          if (window.location.href === before) router.push(fallbackHref);
        }, BACK_TIMEOUT_MS);
      }}
      className={className}
    >
      <ArrowLeft size={20} />
    </button>
  );
}
