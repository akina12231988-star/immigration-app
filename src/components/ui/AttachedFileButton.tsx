"use client";

import { Paperclip } from "lucide-react";

// 添付済みのファイルを「添付済み」と一目で分かるボタンで表示する。
// 押すと別タブでファイルが開き、そのまま閲覧・印刷（ブラウザの印刷）ができる。
// 薄い文字のファイル名だけだと添付されたかどうか分かりにくかったため、
// アプリ内の添付ファイルの表示はこの部品に揃える。
export function AttachedFileButton({
  fileName,
  onOpen,
  prefix,
  note,
  className = "",
}: {
  fileName: string;
  onOpen: () => void;
  prefix?: string; // 「1枚目:」などファイル名の前に出す短い文字
  note?: string; // 添付日など、ファイル名の後ろに小さく出す文字
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // チェックボックスの label の中に置いても、押したときにチェックが変わらないようにする
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      title="押すと別タブで開きます（閲覧・印刷できます）"
      className={`inline-flex min-h-[32px] min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2 py-1 text-left text-[11px] font-bold text-brand hover:bg-brand/20 ${className}`}
    >
      <Paperclip size={12} className="shrink-0" />
      <span className="shrink-0 rounded bg-brand px-1 py-px text-[9px] leading-tight text-brand-foreground">
        添付済み
      </span>
      {prefix && <span className="shrink-0">{prefix}</span>}
      <span className="min-w-0 flex-1 truncate">{fileName}</span>
      {note && <span className="shrink-0 font-normal text-muted">{note}</span>}
    </button>
  );
}
