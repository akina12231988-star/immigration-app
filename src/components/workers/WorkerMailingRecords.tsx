"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { listJudgmentRecordsForWorker } from "@/lib/supabase/queries/tax-cert";
import { MailingRecordAttachments } from "@/components/mailing/MailingRecordAttachments";
import { mailingPostDate, ProgressBadge } from "@/components/mailing/MailingRecordSummary";
import { mailingTargets } from "@/lib/mailing-attachments";
import { formatDateJP, moneyOrderSummary, requestKindLabel, type JudgmentRecord } from "@/lib/tax-cert";


// 外国人詳細の「郵送請求」。郵送請求の画面で保存した記録のうち、この人の分を新しい順に出す。
// 何年度の証明書をどこの自治体（税務署）に請求したかと、郵送請求した書類・届いた証明書・
// 領収書の添付（郵送請求の記録一覧と同じファイル）をここでも見たり貼ったりできる
export function WorkerMailingRecords({
  workerId,
  workerName,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  canEdit: boolean;
}) {
  const [records, setRecords] = useState<JudgmentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listJudgmentRecordsForWorker(createClient(), workerId, workerName)
      .then((rows) => {
        if (!cancelled) setRecords(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "郵送請求の記録を読み込めませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, [workerId, workerName]);

  return (
    <section id="mailing-records">
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-muted">
            <Mail size={14} />
            証明書類の請求（課税・納税証明書／転出届／住民票／納税証明書その3／年金記録）
          </h2>
          <Link
            href={`/mailing?q=${encodeURIComponent(workerName)}`}
            className="shrink-0 text-xs font-bold text-brand"
          >
            証明書類の請求の画面へ
          </Link>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          1件1行で出します。行を押すと「詳細を表示」で、請求先・定額小為替・郵送請求した書類・届いた証明書・領収書を見たり添付したりできます。
          届いた証明書を添付すると、申請準備の画面（課税証明書・納税証明書の行）にも出ます。
        </p>
        {error ? (
          <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>
        ) : records === null ? (
          <p className="text-xs text-muted">読み込み中…</p>
        ) : records.length === 0 ? (
          <p className="rounded-xl bg-background p-3 text-xs text-muted">証明書類の請求の記録はまだありません。</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {records.map((r) => (
              <MailingRecordRow key={r.id} record={r} canEdit={canEdit} />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function MailingRecordRow({
  record: r,
  canEdit,
}: {
  record: JudgmentRecord;
  canEdit: boolean;
}) {
  // ふだんは1行だけ。「詳細を表示」で請求先・定額小為替・届いた証明書・添付を開く
  const [open, setOpen] = useState(false);
  const post = mailingPostDate(r);
  const orders = moneyOrderSummary(r.moneyOrders ?? []);
  const targets = mailingTargets(r);
  // 1行に出す要約（例: 課税・納税証明書 2025年度（令和7年度） → 新潟市）
  const summary = targets.map((t) => `${t.what} → ${t.where}`).join("／");
  return (
    <div className="rounded-xl border border-border bg-background text-xs leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronUp size={13} className="shrink-0 text-brand" /> : <ChevronDown size={13} className="shrink-0 text-brand" />}
        <span className="shrink-0 font-bold">{requestKindLabel(r.requestKind)}</span>
        <span className="shrink-0">
          <ProgressBadge progress={r.mailingProgress} requestKind={r.requestKind} />
        </span>
        <span className="min-w-0 flex-1 truncate text-muted" title={summary}>
          {summary}
        </span>
        <span className="hidden shrink-0 text-muted sm:inline">
          {post ? `投函 ${formatDateJP(post)}` : `記録 ${new Date(r.createdAt).toLocaleDateString("ja-JP")}`}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-brand">{open ? "閉じる" : "詳細を表示"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted">
            <span>{post ? `投函 ${formatDateJP(post)}` : `記録 ${new Date(r.createdAt).toLocaleDateString("ja-JP")}`}</span>
            {r.todoNumber && <span>TODO {r.todoNumber}</span>}
            <Link href={`/mailing/records/${r.id}`} className="ml-auto inline-flex items-center gap-1 font-bold text-brand hover:underline">
              <ExternalLink size={12} />
              記録の詳細（進捗の変更など）
            </Link>
          </div>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {targets.map((t, i) => (
              <li key={i} className="flex flex-wrap gap-x-1.5">
                <span>{t.what}</span>
                <span className="text-muted">→</span>
                <span className="font-bold">{t.where}</span>
              </li>
            ))}
          </ul>
          {orders && <p className="mt-1 text-muted">{orders}</p>}
          {/* 郵送請求した書類・届いた証明書・領収書。届いた証明書はここで添付すると申請準備の画面にも出る */}
          <div className="mt-2 rounded-xl bg-surface p-2.5">
            <MailingRecordAttachments record={r} canEdit={canEdit} />
          </div>
        </div>
      )}
    </div>
  );
}
