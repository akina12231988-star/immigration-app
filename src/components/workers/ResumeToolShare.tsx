"use client";

import { useState } from "react";
import { Check, Copy, QrCode, Send, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { QrImage, QrSaveButton, useOrigin } from "@/app/(app)/custody/QrImage";
import {
  RESUME_LANGS,
  resumeInviteMessage,
  resumeLangForNationality,
  resumeToolUrl,
  type ResumeLang,
} from "@/lib/resume-tool";

// 履歴書ツール（/resume）を本人に案内する。
// 国籍に合わせた言語の案内文＋リンクを、コピー／共有（LINE・Messenger など）／QRで渡せる。
export function ResumeToolShare({
  nationality,
  className,
  compact = false,
}: {
  nationality?: string | null;
  className?: string;
  compact?: boolean; // 外国人詳細の小さなリンク風ボタン
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<ResumeLang>(() => resumeLangForNationality(nationality));
  const [copied, setCopied] = useState<"message" | "url" | null>(null);
  const origin = useOrigin();
  const url = resumeToolUrl(origin || "");
  const message = resumeInviteMessage(lang, url);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async (text: string, kind: "message" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      window.prompt("この文をコピーして本人に送ってください", text);
    }
  };
  // 共有シート（スマホ）。LINE・Messenger・メールなどに文面ごと渡せる
  const share = async () => {
    try {
      await navigator.share({ text: message });
    } catch {
      // 共有をやめただけのときは何もしない
    }
  };

  const buttonClass =
    className ??
    (compact
      ? "flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted"
      : "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-3.5 text-base font-bold text-foreground hover:bg-background active:scale-[0.98]");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Share2 size={compact ? 14 : 18} />
        履歴書を依頼
      </button>
      <Modal open={open} title="履歴書ツールを本人に案内" onClose={() => setOpen(false)}>
        <div className="space-y-4 p-4">
          <p className="text-xs leading-relaxed text-muted">
            本人はログインなしでこのリンクを開き、自分の言語で入力して日本語の履歴書PDFを作れます。
            届いたPDFは「外国人 ＞ 履歴書PDF」で取り込めます。
          </p>

          {/* 案内文の言語 */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-muted">案内文の言語</p>
            <div className="flex flex-wrap gap-1.5">
              {RESUME_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    lang === l.code ? "border-brand bg-brand text-brand-foreground" : "border-border text-muted"
                  }`}
                >
                  {l.flag} {l.name}
                </button>
              ))}
            </div>
          </div>

          <textarea
            readOnly
            value={message}
            rows={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
            onFocus={(e) => e.target.select()}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy(message, "message")}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground"
            >
              {copied === "message" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "message" ? "コピーしました" : "案内文をコピー"}
            </button>
            {canShare && (
              <button
                type="button"
                onClick={() => void share()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold"
              >
                <Send size={16} />
                LINE・Messengerなどで送る
              </button>
            )}
            <button
              type="button"
              onClick={() => void copy(url, "url")}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold"
            >
              {copied === "url" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "url" ? "コピーしました" : "リンクだけコピー"}
            </button>
          </div>

          {/* QR（目の前にいる人にはスマホのカメラで読んでもらう） */}
          {url && (
            <div className="flex items-center gap-4 rounded-xl border border-border p-3">
              <QrImage text={url} size={120} className="shrink-0 rounded bg-white" />
              <div className="min-w-0 space-y-2">
                <p className="text-xs leading-relaxed text-muted">
                  目の前にいる人には、このQRをスマホのカメラで読んでもらうと開けます。
                </p>
                <code className="block break-all text-xs">{url}</code>
                <QrSaveButton
                  text={url}
                  filename="rireki-tool-qr.png"
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand"
                >
                  <QrCode size={14} />
                  QR画像を保存
                </QrSaveButton>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
