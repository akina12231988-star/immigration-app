"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { popNavHistory } from "@/lib/nav-history";
import { checkNavGuard } from "@/lib/nav-guard";

// 戻れなかったと判断するまでの待ち時間（ブラウザの戻る処理が終わるのを少し待つ）
const BACK_TIMEOUT_MS = 400;

// サイト内の「戻る」ボタン。直前に表示していた画面へ戻る。
// まずサイト内で積んでいる履歴（nav-history）の1つ前の画面へ移動し、
// 無ければブラウザ履歴のback、それも無ければ fallbackHref へ移動する。
// 新しいタブで開いた画面（印刷用のページなど）やURLを直接開いたときは戻る先が無いので、
// fallbackHref へ移動する。
// ブラウザによっては新しいタブでも history.length が2以上になり、戻るを押しても
// 何も起きないことがあるため、少し待っても画面が変わらなければ fallbackHref へ移動する。
// このときは履歴に足さず今の画面を置き換える（足すと「←」で元の画面と行ったり来たりになる）。
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

  const goBack = () => {
    // サイト内で1つ前に表示していた画面が分かるときは、そこへ確実に移動する
    const current = `${window.location.pathname}${window.location.search}`;
    const prev = popNavHistory(current);
    if (prev) {
      router.push(prev);
      return;
    }
    if (window.history.length <= 1) {
      router.replace(fallbackHref);
      return;
    }
    const before = window.location.href;
    router.back();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // 戻る先が無くてURLが変わらないときは、決めておいた画面へ移動する
      if (window.location.href === before) router.replace(fallbackHref);
    }, BACK_TIMEOUT_MS);
  };

  return (
    <button
      type="button"
      aria-label="戻る"
      onClick={() => {
        // 保存していない変更がある画面では、先に確認を出す（「保存せずに移動」で続きを実行）
        if (!checkNavGuard(goBack)) return;
        goBack();
      }}
      className={className}
    >
      <ArrowLeft size={20} />
    </button>
  );
}
