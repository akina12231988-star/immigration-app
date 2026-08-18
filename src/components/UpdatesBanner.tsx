"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useUnreadReleaseCount } from "@/lib/release-notes-read";

// ホームに出す「新しい機能があります」の案内。
// 「更新のお知らせ」を開くと消える（端末ごとに覚える）
export function UpdatesBanner() {
  const count = useUnreadReleaseCount();
  if (count === 0) return null;
  return (
    <Link
      href="/updates"
      className="flex items-center gap-2.5 rounded-xl border border-brand/40 bg-brand/5 px-3.5 py-3 text-sm font-bold text-brand"
    >
      <Sparkles size={17} className="shrink-0" />
      <span className="min-w-0 flex-1">
        新しく追加した機能のお知らせが{count}件あります
      </span>
      <ArrowRight size={16} className="shrink-0" />
    </Link>
  );
}
