"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Mailbox, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { prepDetailHref } from "@/lib/application-prep";
import {
  groupByIssuer,
  issueRequestSummary,
  NO_ISSUER_LABEL,
  type IssueRequestRow,
} from "@/lib/issue-requests";

// 「発行依頼中」の書類を、誰に依頼したかでまとめて出す。
// 誰に頼んで、まだ届いていないのか・もう発行済みなのかが1画面で分かるようにする。
export function IssueRequestsClient({
  rows,
  error,
}: {
  rows: IssueRequestRow[];
  error: string | null;
}) {
  // 既定は「まだのものだけ」。済みも見たいときに切り替える
  const [showDone, setShowDone] = useState(false);
  const groups = useMemo(() => groupByIssuer(rows), [rows]);
  const summary = useMemo(() => issueRequestSummary(rows), [rows]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Mailbox size={16} />
          発行依頼のまとめ
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          申請準備で課税証明書・納税証明書の準備状況を「発行依頼中」にしたぶんを、
          発行依頼先ごとにまとめています。書類名を押すと、その人の申請準備の詳細が開きます。
          発行されたら、そちらで準備状況を「発行完了」にしてください。
        </p>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
            発行依頼を取得できませんでした（{error}）。0件という意味ではありません。
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1 rounded-lg border border-seal/40 bg-seal/10 px-2.5 py-1 text-seal">
            <Clock size={13} />
            依頼中 {summary.pending}件
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-muted">
            <CheckCircle2 size={13} />
            発行済み {summary.done}件
          </span>
          {summary.noIssuer > 0 && (
            <span className="flex items-center gap-1 rounded-lg border border-seal/40 px-2.5 py-1 text-seal">
              <TriangleAlert size={13} />
              依頼先が未選択 {summary.noIssuer}件
            </span>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="size-4"
            />
            発行済みも出す
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
            発行依頼はありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const list = showDone ? [...g.pending, ...g.done] : g.pending;
              if (list.length === 0) return null;
              return (
                <li key={g.issuer || "none"} className="rounded-xl border border-border p-3">
                  <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className={g.issuer ? "" : "text-seal"}>
                      {g.issuer || NO_ISSUER_LABEL}
                    </span>
                    <span className="font-normal text-muted">
                      依頼中 {g.pending.length}件
                      {g.done.length > 0 && ` ／ 発行済み ${g.done.length}件`}
                    </span>
                  </p>
                  {!g.issuer && (
                    <p className="mb-1.5 text-[11px] leading-relaxed text-seal">
                      誰に依頼したかが入っていません。申請準備の「発行依頼先（誰に依頼したか）」で選んでください。
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {list.map((r) => (
                      <li
                        key={`${r.checklistId}-${r.docId}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed"
                      >
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${
                            r.done
                              ? "border border-border text-muted"
                              : "border border-seal/40 bg-seal/10 text-seal"
                          }`}
                        >
                          {r.done ? "発行済み" : "依頼中"}
                        </span>
                        <Link
                          href={`/workers/${r.workerId}`}
                          className="font-bold text-brand underline"
                        >
                          {r.workerName}
                        </Link>
                        <Link href={prepDetailHref(r.workerId)} className="underline">
                          {r.docLabel}
                        </Link>
                        <span className="text-muted">{r.status}</span>
                        {r.todoNo && <span className="text-muted">／ {r.todoNo}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
