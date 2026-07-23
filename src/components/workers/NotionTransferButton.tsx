"use client";

import { useState } from "react";
import { Check, ClipboardCopy, ExternalLink, Loader2, UploadCloud } from "lucide-react";
import { buildNotionTransferText } from "@/lib/notion-transfer";
import { notionAppUrl } from "@/lib/notion-link";
import { syncWorkerToNotion } from "@/app/(app)/workers/notion-actions";
import type { Worker } from "@/types/db";

// 外国人情報をNotionへ反映する。
// - 「Notionに登録／更新」: API連携でNotionページへ直接書き込む（案A: アプリ優先・空欄は保持）
// - 「コピー」: Notion AIに読み込ませるための転記テキストをコピー（API未設定時のフォールバック）
export function NotionTransferButton({ worker }: { worker: Worker }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ url: string; count: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await syncWorkerToNotion(worker.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setResult({ url: res.url, count: res.written.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notionへの同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  }

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
        onClick={sync}
        disabled={syncing}
        className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
      >
        {syncing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
        {syncing ? "同期中…" : "Notionに登録／更新"}
      </button>
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted"
      >
        {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
        {copied ? "コピーしました" : "コピー（AI転記用）"}
      </button>

      {result && (
        <div className="w-56 rounded-lg border border-brand/40 bg-brand/5 px-2.5 py-2 text-[11px] text-muted">
          Notionに反映しました（{result.count}項目）。
          {result.url && (
            <a
              href={notionAppUrl(result.url)}
              className="mt-1 flex items-center gap-1 font-bold text-brand"
            >
              <ExternalLink size={12} />
              Notionのページを開く
            </a>
          )}
        </div>
      )}
      {copied && (
        <div className="w-56 rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-muted">
          Notionのページを開き、貼り付けて Notion AI に「各プロパティに入力して」と指示してください。
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
