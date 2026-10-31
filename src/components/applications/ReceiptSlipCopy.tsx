"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { copyImageUrlToClipboard } from "@/lib/image-clipboard";
import type { ApplicationFile } from "@/types/application";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;

// 報告文の横に出す受付票の画像。「画像をコピー」で画像をクリップボードに入れて、LINE・Messenger に貼れるようにする。
// オンライン申請は3通目のメールのスクリーンショットが受付票（receiptSlipFiles で渡す）
export function ReceiptSlipCopy({ files }: { files: ApplicationFile[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const copy = async (f: ApplicationFile) => {
    setFailed(null);
    const ok = await copyImageUrlToClipboard(f.url);
    if (ok) {
      setCopied(f.id);
      setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 2000);
    } else {
      setFailed(f.id);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold text-muted">受付票の画像</p>
      {files.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-[11px] text-muted">
          受付票の画像がまだありません（「画像」の受付票に登録すると、ここからコピーできます）
        </p>
      )}
      {files.map((f) => {
        const image = IMAGE_EXT.test(f.fileName);
        return (
          <div key={f.id} className="flex flex-col gap-1.5">
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-border bg-surface"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.fileName} className="max-h-48 w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-1 px-2 py-4 text-center">
                  <FileText size={22} className="text-brand" />
                  <span className="line-clamp-2 break-all text-[10px] text-muted">{f.fileName}</span>
                </span>
              )}
            </a>
            {image ? (
              <button
                type="button"
                onClick={() => void copy(f)}
                className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-xs font-bold text-brand"
              >
                {copied === f.id ? <Check size={14} /> : <Copy size={14} />}
                {copied === f.id ? "コピーしました" : "画像をコピー"}
              </button>
            ) : (
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-xs font-bold text-brand"
              >
                <ExternalLink size={14} />
                PDFを開く
              </a>
            )}
            {failed === f.id && (
              <p className="text-[10px] leading-snug text-seal">
                この環境では画像をコピーできませんでした。画像を押して開き、保存して送ってください。
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
