"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2, MailPlus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { getOnboardingRecord, listOnboardingDocs } from "@/lib/supabase/queries/onboarding";
import { getOnboardingDocDownloadUrl } from "@/app/(app)/onboarding/actions";
import { isPendingDocAlert, isPendingDocOverdue } from "@/lib/onboarding";
import { todayStr } from "@/lib/ssw/calc";
import type { OnboardingDocumentRow, OnboardingRecordRow } from "@/types/db";

// 入社書類メールで登録したデータの一覧。
// チェックで選んだファイルを「外国人の氏名＋添付データ名」の名前でダウンロードできる。
export function OnboardingDocuments({ workerId }: { workerId: string }) {
  const [record, setRecord] = useState<OnboardingRecordRow | null>(null);
  const [docs, setDocs] = useState<OnboardingDocumentRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      getOnboardingRecord(supabase, workerId),
      listOnboardingDocs(supabase, workerId),
    ])
      .then(([r, d]) => {
        setRecord(r);
        setDocs(d);
      })
      .catch(() => undefined);
  }, [workerId]);

  const today = todayStr();
  const files = docs.filter((d) => d.storage_path);
  const pending = docs.filter((d) => isPendingDocAlert(d));

  // 何も登録されていなければセクションごと出さない（メール作成への導線だけ残す）
  const hasAny = record !== null || docs.length > 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError(null);
    try {
      for (const doc of files.filter((f) => selected.has(f.id))) {
        const res = await getOnboardingDocDownloadUrl(doc.id);
        if (!res.ok) throw new Error(`${doc.label}: ${res.message}`);
        const a = document.createElement("a");
        a.href = res.url;
        a.download = res.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 連続ダウンロードがブラウザにブロックされないよう少し間隔をあける
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted">入社書類（メール添付データ）</h2>
        <Link
          href={`/onboarding?worker=${workerId}`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
        >
          <MailPlus size={13} />
          入社書類メール
        </Link>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      {!hasAny ? (
        <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
          まだ登録がありません。「入社書類メール」から書類のアップロードとメール作成ができます。
        </p>
      ) : (
        <div className="space-y-3">
          {/* 後送のまま未受領の書類 */}
          {pending.length > 0 && (
            <div className="rounded-xl border border-status-notice-fg/40 bg-status-notice-bg/40 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-status-notice-fg">
                <TriangleAlert size={13} />
                後送待ち {pending.length}件
              </p>
              <ul className="space-y-0.5 text-xs">
                {pending.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.label}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        isPendingDocOverdue(d.due_on, today) ? "font-bold text-seal" : "text-muted"
                      }`}
                    >
                      {d.due_on ? `期日 ${d.due_on}` : "期日未設定"}
                      {isPendingDocOverdue(d.due_on, today) && "（超過）"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* アップロード済みファイル: 選択してダウンロード */}
          {files.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
              アップロード済みのファイルはまだありません。
            </p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border">
                {files.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{d.label}</span>
                      <span className="block truncate text-[11px] text-muted">{d.file_name}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={downloadSelected}
                disabled={selected.size === 0 || downloading}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-40"
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                選択したデータをダウンロード（{selected.size}件）
              </button>
              <p className="text-[11px] text-muted">
                ファイル名は「外国人の氏名＋添付データ名」で保存されます。
              </p>
            </>
          )}

          {/* Gmailリンク */}
          {record?.gmail_link && (
            <a
              href={record.gmail_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-brand"
            >
              <ExternalLink size={13} />
              最初に送ったメールをGmailで開く
              {record.mail_sent_on && (
                <span className="font-medium text-muted">（送信日 {record.mail_sent_on}）</span>
              )}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
