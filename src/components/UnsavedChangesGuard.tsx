"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { isInternalNavigation, setNavGuard } from "@/lib/nav-guard";

// 編集して保存していない内容があるまま別の画面へ行こうとしたときに、
// 「保存しなくても大丈夫ですか？」と確認を出す。
// ・サイト内のリンク（メニュー・一覧へのリンクなど）と「←」ボタン: この確認を出し、
//   「保存して移動」「保存せずに移動」「このページに戻る」を選べる
// ・タブを閉じる・再読み込み・別のサイトへ: ブラウザの確認（文言はブラウザが決める）
export function UnsavedChangesGuard({
  dirty,
  onSave,
  saveLabel = "保存",
}: {
  dirty: boolean;
  onSave: () => Promise<boolean>; // 保存できたら true
  saveLabel?: string; // 画面の保存ボタンの名前（案内文に使う）
}) {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // タブを閉じる・再読み込み
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // サイト内のリンクのクリック（ほかの処理より先に拾う）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!isInternalNavigation(anchor, window.location, e)) return;
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.href;
      const sameOrigin = new URL(href).origin === window.location.origin;
      setPending(() => () => {
        if (sameOrigin) router.push(href.slice(window.location.origin.length));
        else window.location.href = href;
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  // 「←」ボタン（BackButton）からの移動
  useEffect(() => {
    setNavGuard((proceed) => {
      if (!dirtyRef.current) return false;
      setPending(() => proceed);
      return true;
    });
    return () => setNavGuard(null);
  }, []);

  if (!pending) return null;

  const leave = () => {
    const go = pending;
    dirtyRef.current = false; // この移動では確認を出さない
    setPending(null);
    go();
  };
  const saveAndLeave = async () => {
    setBusy(true);
    const ok = await onSave();
    setBusy(false);
    if (ok) leave();
    else setPending(null); // 保存できなかったときは画面に残ってエラーを見てもらう
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && setPending(null)}
    >
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="flex items-center gap-2 text-base font-bold">
          <AlertTriangle size={20} className="text-status-notice-fg" />
          保存しなくても大丈夫ですか？
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          編集した内容がまだ保存されていません。このまま移動すると入力した内容は消えます。
          残すときは「{saveLabel}」ボタン（下の「保存して移動」）を押してください。
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void saveAndLeave()}
            disabled={busy}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "保存中…" : "保存して移動"}
          </button>
          <button
            type="button"
            onClick={leave}
            disabled={busy}
            className="min-h-[44px] rounded-xl border border-seal/40 text-sm font-bold text-seal disabled:opacity-60"
          >
            保存せずに移動
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            disabled={busy}
            className="min-h-[40px] text-sm font-bold text-muted"
          >
            このページに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
