"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// 申請詳細の折りたたみ1段（案C）。
// 閉じていても見出しに要約が出るので、開くのは今やる段階だけでよい。
// `open` は最初に開いておくかどうかで、段階が進んで変わると開く枠も変わる。
// ヘッダーの「今やること」から飛べるよう、id を付けて scrollToDetailSection で開く。
export function DetailSection({
  id,
  title,
  summary,
  warn = false,
  danger = false,
  open,
  actions,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  warn?: boolean; // 要約を赤で出す（未入力・未郵送など、やることが残っている）
  danger?: boolean; // 見出しを赤で出す（取下げ・削除）
  open: boolean;
  actions?: ReactNode; // 見出しの右端に出す小さな操作（コピーなど）。押しても開閉しない
  children: ReactNode;
}) {
  return (
    <details id={id} open={open} className="group border-b border-border last:border-b-0 open:bg-background/40">
      <summary className="flex min-h-[48px] cursor-pointer select-none flex-wrap items-center gap-x-2.5 gap-y-0.5 px-4 py-2.5 text-sm">
        <ChevronDown size={15} className="shrink-0 -rotate-90 text-muted transition-transform group-open:rotate-0" />
        <span className={`font-bold ${danger ? "text-seal" : ""}`}>{title}</span>
        <span className={`min-w-0 flex-1 basis-40 text-xs ${warn ? "font-bold text-seal" : "text-muted"}`}>{summary}</span>
        {actions && (
          <span
            className="flex shrink-0 items-center gap-1.5"
            onClick={(e) => {
              // 見出しの中のボタンやリンクは、押しても折りたたみを開閉しない
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {actions}
          </span>
        )}
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

// ヘッダーの「今やること」から、その折りたたみを開いて見えるところまで動かす
export function scrollToDetailSection(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}
