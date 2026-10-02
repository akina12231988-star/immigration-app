"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, ExternalLink, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import {
  savePostApplyMailings,
  savePostApplyNotes,
  savePostApplyTasks,
} from "@/lib/supabase/queries/application-prep";
import { PostApplyMailingPanel } from "@/components/workers/PostApplyMailingPanel";
import { PostApplyItemNotes } from "@/components/workers/PostApplyItemNotes";
import {
  addPostApplyNote,
  openPostApplyCount,
  postApplyDocKey,
  postApplyMailingRecords,
  postApplyTaskKey,
  prepDocLabel,
  removePostApplyNote,
  type PostApplyEntry,
  type PostApplyMailing,
  type PostApplyNotes,
} from "@/lib/post-apply";
import { todayStr } from "@/lib/ssw/calc";
import { dbErrorMessage } from "@/lib/errors";
import { letterPackTrackingUrl } from "@/lib/application-prep";
import type { Application } from "@/types/application";

// "2026-09-25" → "2026/9/25"（投函日の表記）
function postedOnLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : d || "日付未入力";
}

// 申請一覧の「申請後の郵送・タスク」タブ。
// 申請準備で「申請後に発行され次第、入管へ郵送する」にチェックした書類と、
// 「発行のみ（入管へは郵送しない）」にした書類、
// 「申請後に入管へ郵送するリスト」に入れたタスクを、人ごとにまとめて出す。
// 郵送した・済んだものはこの画面のまま消し込める。
export function PostApplyBoard({
  entries,
  applications,
  keyword,
  canEdit,
  onChanged,
}: {
  entries: PostApplyEntry[];
  applications: Application[];
  keyword: string;
  canEdit: boolean;
  onChanged: (entry: PostApplyEntry) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // 外国人ごとのいちばん新しい申請（申請詳細へのリンク）
  const appByWorker = useMemo(() => {
    const m = new Map<string, Application>();
    for (const a of applications) {
      if (!a.workerId) continue;
      const cur = m.get(a.workerId);
      if (!cur || (a.applicationDate || a.createdAt) > (cur.applicationDate || cur.createdAt)) m.set(a.workerId, a);
    }
    return m;
  }, [applications]);

  const kw = keyword.trim().toLowerCase();
  const matchesKw = (e: { workerName: string; todoNo: string }) =>
    !kw || e.workerName.toLowerCase().includes(kw) || e.todoNo.toLowerCase().includes(kw);
  const shown = entries.filter((e) => openPostApplyCount(e) > 0 && matchesKw(e));
  // 入管へ郵送した記録（全部郵送し終わった人の分も含む）。投函日の新しい順
  const mailed = useMemo(() => postApplyMailingRecords(entries.filter(matchesKw)), [entries, kw]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMailings = async (e: PostApplyEntry, mailings: PostApplyMailing[]) => {
    setError(null);
    try {
      await savePostApplyMailings(createClient(), e.checklistId, mailings);
      onChanged({ ...e, mailings });
    } catch (err) {
      setError(dbErrorMessage(err, "0168_prep_post_apply_mailings.sql", "保存に失敗しました"));
    }
  };
  // 項目ごとのメモ（例：現在発行手続き中との連絡あり）
  const saveNotes = async (e: PostApplyEntry, notes: PostApplyNotes) => {
    setError(null);
    try {
      await savePostApplyNotes(createClient(), e.checklistId, notes);
      onChanged({ ...e, notes });
    } catch (err) {
      setError(dbErrorMessage(err, "0172_prep_post_apply_notes.sql", "メモの保存に失敗しました"));
    }
  };
  const doneTask = async (e: PostApplyEntry, taskId: string) => {
    setError(null);
    const tasks = e.tasks.map((t) => (t.id === taskId ? { ...t, done: true } : t));
    try {
      await savePostApplyTasks(createClient(), e.checklistId, tasks);
      onChanged({ ...e, tasks });
    } catch (err) {
      setError(dbErrorMessage(err, "0167_prep_post_apply_tasks.sql", "保存に失敗しました"));
    }
  };

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        申請準備で「申請後に発行され次第、入管へ郵送する」にチェックした書類と、「申請後に入管へ郵送するリスト」に入れたタスクを人ごとにまとめています。
        「メモを追加」で、各項目に連絡の内容などを残せます（例：現在発行手続き中との連絡あり）。郵送したら「入管へ郵送した」で投函日・追跡番号を記録します（同じ日・同じ追跡番号なら「まとめて入管へ郵送した」で一度に）。全部郵送してタスクも済むと上の一覧からは消えますが、投函の記録は下の「入管へ郵送した記録」と申請詳細でいつでも見返せます。
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}
      <p className="text-sm font-bold text-muted">{shown.length}人</p>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-center text-sm text-muted">申請後に郵送する書類・タスクはありません。</p>
      ) : (
        shown.map((e) => {
          const app = appByWorker.get(e.workerId);
          const openTasks = e.tasks.filter((t) => !t.done);
          return (
            <Card key={e.checklistId} className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{e.workerName || "氏名不明"}</p>
                  <p className="text-[11px] text-muted">
                    {e.todoNo || "TODO番号未設定"}
                    {app ? `　${app.applicationContent || "申請内容未入力"}（${app.status}）` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Link
                    href={`/workers/${e.workerId}/application-prep`}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                  >
                    <ClipboardList size={12} />
                    申請準備
                  </Link>
                  {app && (
                    <Link
                      href={`/applications/${app.id}`}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand"
                    >
                      <ExternalLink size={12} />
                      申請詳細
                    </Link>
                  )}
                </div>
              </div>
              {e.docIds.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] font-bold text-status-notice-fg">入管へ郵送する書類</p>
                  <PostApplyMailingPanel
                    docIds={e.docIds}
                    mailings={e.mailings}
                    canEdit={canEdit}
                    onSave={(mailings) => saveMailings(e, mailings)}
                    notes={e.notes}
                    onSaveNotes={(notes) => saveNotes(e, notes)}
                  />
                </div>
              )}
              {/* 発行はするが入管へは郵送しない書類（郵送待ちと混ざらないよう別の欄に出す） */}
              {e.issueOnlyDocs.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] font-bold text-muted">
                    発行はするが入管へは郵送しない書類
                  </p>
                  <ul className="space-y-1">
                    {e.issueOnlyDocs.map((d) => (
                      <li
                        key={d.docId}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 text-xs"
                      >
                        <span className={`min-w-0 flex-1 break-words ${d.done ? "text-muted" : ""}`}>
                          {prepDocLabel(d.docId)}
                        </span>
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            d.done
                              ? "bg-status-approved-bg text-status-approved-fg"
                              : "bg-status-notice-bg text-status-notice-fg"
                          }`}
                        >
                          {d.done ? "発行済み" : "発行待ち"}
                        </span>
                        <PostApplyItemNotes
                          notes={e.notes[postApplyDocKey(d.docId)] ?? []}
                          canEdit={canEdit}
                          onAdd={(text, by) =>
                            saveNotes(
                              e,
                              addPostApplyNote(e.notes, postApplyDocKey(d.docId), text, todayStr(), by),
                            )
                          }
                          onRemove={(noteId) =>
                            saveNotes(e, removePostApplyNote(e.notes, postApplyDocKey(d.docId), noteId))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="mt-2 space-y-1">
                {openTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 break-words">
                      <span className="mr-1.5 rounded bg-brand/10 px-1 text-[10px] font-bold text-brand">タスク</span>
                      {t.text}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => void doneTask(e, t.id)}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-bold text-brand"
                      >
                        <Check size={12} />
                        済み
                      </button>
                    )}
                    <PostApplyItemNotes
                      notes={e.notes[postApplyTaskKey(t.id)] ?? []}
                      canEdit={canEdit}
                      onAdd={(text, by) =>
                        saveNotes(e, addPostApplyNote(e.notes, postApplyTaskKey(t.id), text, todayStr(), by))
                      }
                      onRemove={(noteId) => saveNotes(e, removePostApplyNote(e.notes, postApplyTaskKey(t.id), noteId))}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}

      {/* 入管へ郵送した記録（いつ・何を・追跡番号）。全部郵送し終わった人の分もここに残る */}
      <Card className="p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <PackageCheck size={15} />
          入管へ郵送した記録（{mailed.length}件）
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          「入管へ郵送した」で記録した投函を、新しい順に並べています。追跡番号を押すと日本郵便の追跡が開きます。
          取り消すときは、その人の申請準備の「申請後に入管へ郵送するリスト」で「取り消す」を押してください。
        </p>
        {mailed.length === 0 ? (
          <p className="mt-2 text-xs text-muted">まだ記録がありません。</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {mailed.map((r) => {
              const app = appByWorker.get(r.workerId);
              return (
                <li key={`${r.checklistId}-${r.mailing.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-xs">
                  <span className="w-[5.5rem] shrink-0 font-bold tabular-nums">{postedOnLabel(r.mailing.posted_on)}</span>
                  <span className="min-w-[10rem] font-bold">
                    {app ? (
                      <Link href={`/applications/${app.id}`} className="text-brand hover:underline">
                        {r.workerName || "氏名不明"}
                      </Link>
                    ) : (
                      r.workerName || "氏名不明"
                    )}
                    {r.todoNo && <span className="ml-1 font-normal text-muted">（{r.todoNo}）</span>}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{r.mailing.doc_ids.map(prepDocLabel).join("・")}</span>
                  <span className="shrink-0 text-muted">
                    追跡番号{" "}
                    {r.mailing.tracking ? (
                      <a
                        href={letterPackTrackingUrl(r.mailing.tracking)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold tabular-nums text-brand underline"
                      >
                        {r.mailing.tracking}
                      </a>
                    ) : (
                      "未入力"
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
