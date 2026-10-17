"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Image as ImageIcon } from "lucide-react";
import { EXAM_FEE_ACCOUNT, examFeeAccountText } from "@/lib/exam-fee-account";

// 試験の代金の振込先（口座案内）。本人に送れるように、画像と文章をその場でコピーできる。
// 画像のコピーはブラウザが対応していれば（Chrome・Safari・Edge）クリップボードに画像として入り、
// Messenger などにそのまま貼れる。対応していないときは画像を開いて保存してもらう
export function ExamFeeAccountCard({
  fee,
  examLabel,
  compact = false,
}: {
  fee?: string; // 代金（分かっていれば文章に入れる）
  examLabel?: string; // 「２号農業試験」など
  compact?: boolean; // 一覧の上などで小さく出す（画像のプレビューを出さない）
}) {
  const [copied, setCopied] = useState<"image" | "text" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (kind: "image" | "text") => {
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  };

  const copyImage = async () => {
    setError(null);
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error("unsupported");
      }
      const res = await fetch(EXAM_FEE_ACCOUNT.imagePath);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("image");
    } catch {
      setError("この環境では画像をコピーできません。「画像を開く」から保存して送ってください。");
    }
  };

  const copyText = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(examFeeAccountText(fee, examLabel));
      flash("text");
    } catch {
      setError("文章をコピーできませんでした。");
    }
  };

  const btn = "inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-bold text-brand hover:bg-brand/5";

  return (
    <div className={`rounded-lg border border-border bg-background ${compact ? "px-2.5 py-2" : "p-2.5"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-muted">
          振込先の口座案内（{EXAM_FEE_ACCOUNT.bank}・名義 {EXAM_FEE_ACCOUNT.holder}）
        </span>
        <button type="button" onClick={() => void copyImage()} className={btn}>
          {copied === "image" ? <Check size={12} /> : <ImageIcon size={12} />}
          {copied === "image" ? "画像をコピーしました" : "画像をコピー"}
        </button>
        <button type="button" onClick={() => void copyText()} className={btn}>
          {copied === "text" ? <Check size={12} /> : <Copy size={12} />}
          {copied === "text" ? "文章をコピーしました" : "文章をコピー（口座と金額）"}
        </button>
        <a href={EXAM_FEE_ACCOUNT.imagePath} target="_blank" rel="noopener noreferrer" className={btn}>
          <ExternalLink size={12} />
          画像を開く
        </a>
      </div>
      {error && <p className="mt-1 text-[11px] text-seal">{error}</p>}
      {!compact && (
        <a href={EXAM_FEE_ACCOUNT.imagePath} target="_blank" rel="noopener noreferrer" className="mt-2 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EXAM_FEE_ACCOUNT.imagePath}
            alt="試験代金の振込先（口座案内）"
            className="max-h-48 w-auto rounded-lg border border-border bg-surface"
          />
        </a>
      )}
    </div>
  );
}
