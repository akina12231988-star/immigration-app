"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { generatePostingText, renderPostingCard } from "@/lib/posting-output";
import type { JobPosting } from "@/types/recruiting";

// Facebook掲載用の出力ダイアログ（テキストコピー / 画像PNG保存）
export function PostingOutputDialog({
  posting,
  orgName,
  onClose,
}: {
  posting: JobPosting;
  orgName?: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"text" | "image">("text");
  const [copied, setCopied] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>("");

  const text = useMemo(() => generatePostingText(posting, orgName), [posting, orgName]);

  // 画像タブを開いたときに一度だけ Canvas 描画する（描画は同期的で軽い）
  const openImageTab = () => {
    setTab("image");
    if (!imageUrl) setImageUrl(renderPostingCard(posting, orgName));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `求人_${posting.display_company || orgName || "posting"}.png`;
    a.click();
  };

  return (
    <Modal open title="Facebook掲載用に出力" onClose={onClose}>
      <div className="mb-3 flex rounded-xl border border-border p-0.5">
        <TabButton label="テキスト" active={tab === "text"} onClick={() => setTab("text")} />
        <TabButton label="画像" active={tab === "image"} onClick={openImageTab} />
      </div>

      {tab === "text" ? (
        <div className="space-y-3">
          <pre className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-background p-3.5 text-sm leading-relaxed">
            {text}
          </pre>
          <Button
            fullWidth
            icon={copied ? <Check size={17} /> : <Copy size={17} />}
            onClick={copy}
          >
            {copied ? "コピーしました" : "コピーする"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="掲載用カード"
              className="w-full rounded-xl border border-border"
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl bg-background">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          )}
          <Button fullWidth icon={<Download size={17} />} onClick={download} disabled={!imageUrl}>
            画像を保存（PNG）
          </Button>
          <p className="text-center text-[11px] text-muted">
            スマホは画像を長押しでも保存できます
          </p>
        </div>
      )}
    </Modal>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-sm font-bold ${
        active ? "bg-brand text-brand-foreground" : "text-muted"
      }`}
    >
      {label}
    </button>
  );
}
