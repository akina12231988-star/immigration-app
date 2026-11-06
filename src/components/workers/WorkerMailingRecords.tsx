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

// 添付欄（送った書類・届いた証明書・領収書）は「添付を開く」で開く。届いた証明書は閉じていても出す

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
          何年度の証明書をどこに請求したか・進捗・届いた証明書を確認できます。「記録の詳細」で進捗の変更や添付ができます
          （ここで「添付を開く」からも添付できます）。
        </p>
        {error ? (
          <p className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">{error}</p>
        ) : records === null ? (
          <p className="text-xs text-muted">読み込み中…</p>
        ) : records.length === 0 ? (
          <p className="rounded-xl bg-background p-3 text-xs text-muted">証明書類の請求の記録はまだありません。</p>
        ) : (
          <div className="flex flex-col gap-3">
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
  const [open, setOpen] = useState(false);
  const post = mailingPostDate(r);
  const orders = moneyOrderSummary(r.moneyOrders ?? []);
  const targets = mailingTargets(r);
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-bold">{requestKindLabel(r.requestKind)}</span>
        <ProgressBadge progress={r.mailingProgress} requestKind={r.requestKind} />
        <span className="text-muted">
          {post ? `投函 ${formatDateJP(post)}` : `記録 ${new Date(r.createdAt).toLocaleDateString("ja-JP")}`}
        </span>
        {r.todoNumber && <span className="text-muted">TODO {r.todoNumber}</span>}
        <Link href={`/mailing/records/${r.id}`} className="ml-auto inline-flex items-center gap-1 font-bold text-brand hover:underline">
          <ExternalLink size={12} />
          記録の詳細
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
      {/* 届いた証明書（見るだけ。閉じていても出す） */}
      {!open && (
        <div className="mt-1.5">
          <MailingRecordAttachments record={r} canEdit={false} only={["received"]} divided={false} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] font-bold text-brand"
      >
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {open ? "添付を閉じる" : "添付を開く（郵送請求した書類・届いた証明書・領収書）"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-surface p-2.5">
          <MailingRecordAttachments record={r} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}
