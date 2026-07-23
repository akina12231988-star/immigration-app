"use client";

import { useState } from "react";
import { Check, ClipboardCopy, ExternalLink } from "lucide-react";
import { buildNotionTransferText } from "@/lib/notion-transfer";
import { notionAppUrl } from "@/lib/notion-link";
import type { Worker } from "@/types/db";

// 外国人情報を Notion の項目名に合わせて整形しコピーする「Notionへ転記」ボタン。
// コピー後、Notion のページを開いて Notion AI に貼り付けて入力させる案内を表示する。
export function NotionTransferButton({ worker }: { worker: Worker }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    const text = buildNotionTransferText(worker);
    if (!text) {
      setError("転記できる情報がありません。先に基本情報を入力してください。");
      return;
    }
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setError("コピーに失敗しました。");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand"
      >
        {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
        {copied ? "コピーしました" : "Notionへ転記"}
      </button>
      {copied && (
        <div className="w-56 rounded-lg border border-brand/40 bg-brand/5 px-2.5 py-2 text-[11px] text-muted">
          外国人情報をコピーしました。Notionの外国人ページを開き、貼り付けて Notion AI に「各プロパティに入力して」と指示してください。
          {worker.notion_link && (
            <a
              href={notionAppUrl(worker.notion_link)}
              className="mt-1 flex items-center gap-1 font-bold text-brand"
            >
              <ExternalLink size={12} />
              Notionのページを開く
            </a>
          )}
        </div>
      )}
      {error && <p className="w-56 text-right text-[11px] text-seal">{error}</p>}
    </div>
  );
}
