"use client";

import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { normalizeTodoKey } from "@/lib/todo";
import type { JudgmentRecord } from "@/lib/tax-cert";
import { ProgressBadge, mailingDestination } from "@/components/mailing/MailingRecordSummary";
import { MailingRecordAttachments } from "@/components/mailing/MailingRecordAttachments";

// 申請準備の課税証明書・納税証明書（・年金記録）の行から、証明書類の請求の記録へつなぐ。
// その人の記録（同じTODO番号を優先）があれば記録の詳細ページを開き、届いた証明書をここにも出す。
// まだ無ければ、その人・そのTODOを選んだ状態で請求フォームを開く（記録すると詳細ページが開く）
export function PrepMailingLink({
  kind,
  records,
  workerId,
  todoNo,
}: {
  kind: "tax" | "nenkin";
  records: JudgmentRecord[];
  workerId: string;
  todoNo: string;
}) {
  const key = normalizeTodoKey(todoNo);
  const mine = records.filter((r) => (kind === "nenkin" ? r.requestKind === "nenkin" : (r.requestKind ?? "tax") === "tax"));
  const sameTodo = key ? mine.filter((r) => normalizeTodoKey(r.todoNumber ?? "") === key) : [];
  const record = (sameTodo.length > 0 ? sameTodo : mine)[0] ?? null;
  const newHref = `/mailing?worker=${encodeURIComponent(workerId)}&todo=${encodeURIComponent(todoNo)}&kind=${kind}`;

  if (!record) {
    return (
      <Link
        href={newHref}
        className="ml-[18px] mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand hover:underline"
      >
        <Plus size={11} />
        証明書類の請求で{kind === "nenkin" ? "年金記録" : "課税・納税証明書"}の請求を登録する
      </Link>
    );
  }
  return (
    <div className="ml-[18px] mt-1 space-y-1 rounded-lg border border-border bg-surface/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <ProgressBadge progress={record.mailingProgress} requestKind={record.requestKind} />
        <span className="text-muted">{mailingDestination(record)}</span>
        <Link href={`/mailing/records/${record.id}`} className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
          <ExternalLink size={11} />
          証明書類の請求の記録を開く{record.todoNumber ? `（${record.todoNumber}）` : ""}
        </Link>
      </div>
      {/* 記録の詳細で添付した「届いた証明書」をここにも出す（見るだけ。添付は記録の詳細で） */}
      <MailingRecordAttachments record={record} canEdit={false} only={["received"]} divided={false} />
      {sameTodo.length === 0 && key && (
        <Link href={newHref} className="inline-flex items-center gap-1 text-[10px] font-bold text-muted hover:underline">
          <Plus size={10} />
          このTODO（{todoNo}）の請求を新しく登録する
        </Link>
      )}
    </div>
  );
}
