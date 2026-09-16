"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Mailbox, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { prepDetailHref } from "@/lib/application-prep";
import {
  elapsedDays,
  groupByIssuer,
  issueRequestHref,
  issueRequestSummary,
  NO_ISSUER_LABEL,
  type IssueRequestRow,
} from "@/lib/issue-requests";

// 依頼日からこれだけたっていたら赤く出す（催促の目安）
const STALE_DAYS = 14;

// 依頼中のもの（申請準備の発行依頼と、転居手続き・国保加入の依頼）を、誰に依頼したかでまとめて出す。
// 誰に何を頼んで、いつ頼んで、まだ届いていないのか・もう済んだのかが1画面で分かるようにする。
export function IssueRequestsClient({
  rows,
  error,
  today,
}: {
  rows: IssueRequestRow[];
  error: string | null;
  today: string;
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
          依頼中（発行依頼・手続きの依頼）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          申請準備で準備状況を「発行依頼中」「本人に依頼中」などにした書類（課税証明書・納税証明書・年金記録・保険証など）と、
          外国人詳細の「あとでやる手続き」で依頼を記録した転居手続き・国保加入を、依頼先ごとにまとめています。
          何を押しても、その人の申請準備の詳細（手続きは外国人詳細）が開きます。
          届いたら、そちらで準備状況を「発行完了」などに変えてください。依頼日から{STALE_DAYS}日以上たったものは赤く出ます。
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
            済み {summary.done}件
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
            済みも出す
          </label>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-xl bg-background p-4 text-center text-xs text-muted">
            依頼中のものはありません。
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
                      {g.done.length > 0 && ` ／ 済み ${g.done.length}件`}
                    </span>
                  </p>
                  {!g.issuer && (
                    <p className="mb-1.5 text-[11px] leading-relaxed text-seal">
                      誰に依頼したかが入っていません。申請準備の「発行依頼先（誰に依頼したか）」か、外国人詳細の「あとでやる手続き」の依頼先で入れてください。
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {list.map((r) => {
                      const days = r.done ? null : elapsedDays(r.requestedOn, today);
                      const stale = days != null && days >= STALE_DAYS;
                      return (
                        <li
                          key={`${r.checklistId}-${r.docId}-${r.workerId}`}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed"
                        >
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${
                              r.done
                                ? "border border-border text-muted"
                                : "border border-seal/40 bg-seal/10 text-seal"
                            }`}
                          >
                            {r.done ? "済み" : "依頼中"}
                          </span>
                          <Link
                            href={`/workers/${r.workerId}`}
                            className="font-bold text-brand underline"
                          >
                            {r.workerName}
                          </Link>
                          <Link href={issueRequestHref(r, prepDetailHref)} className="underline">
                            {r.docLabel}
                          </Link>
                          <span className="text-muted">{r.status}</span>
                          {/* 依頼日と経過日数。依頼日が入っていないものは最終更新日で見当を付ける */}
                          {r.requestedOn && (
                            <span className={`tabular-nums ${stale ? "font-bold text-seal" : "text-muted"}`}>
                              依頼日 {r.requestedOn}
                              {days != null && `（${days}日経過）`}
                            </span>
                          )}
                          {!r.requestedOn && !r.done && (
                            <span className="text-seal">依頼日が未入力</span>
                          )}
                          {r.todoNo && <span className="text-muted">／ {r.todoNo}</span>}
                        </li>
                      );
                    })}
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
