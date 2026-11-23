"use client";

import { useLinkStatus } from "next/link";

// <Link> の中に置く文字。押してから次の画面が出るまで「開いています…」と出し、
// そのあいだは押せないようにする（スマホで待つあいだにもう一度タップして、別のものを押してしまわないように）
export function PendingLinkLabel({ children, pendingText = "開いています…" }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "pointer-events-none opacity-70" : undefined} aria-live="polite">
      {pending ? pendingText : children}
    </span>
  );
}
