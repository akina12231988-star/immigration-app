"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ClipboardList, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { savePostApplyMailings, savePostApplyTasks } from "@/lib/supabase/queries/application-prep";
import { PostApplyMailingPanel } from "@/components/workers/PostApplyMailingPanel";
import { openPostApplyCount, type PostApplyEntry, type PostApplyMailing } from "@/lib/post-apply";
import { dbErrorMessage } from "@/lib/errors";
import type { Application } from "@/types/application";

// 申請一覧の「申請後の郵送・タスク」タブ。
// 申請準備で「申請後に発行され次第、入管へ郵送する」にチェックした書類と、
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
  const shown = entries.filter(
    (e) =>
      openPostApplyCount(e) > 0 &&
      (!kw || e.workerName.toLowerCase().includes(kw) || e.todoNo.toLowerCase().includes(kw)),
  );

  const saveMailings = async (e: PostApplyEntry, mailings: PostApplyMailing[]) => {
    setError(null);
    try {
      await savePostApplyMailings(createClient(), e.checklistId, mailings);
      onChanged({ ...e, mailings });
    } catch (err) {
      setError(dbErrorMessage(err, "0168_prep_post_apply_mailings.sql", "保存に失敗しました"));
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
        郵送したら「入管へ郵送した」で投函日・追跡番号を記録します（同じ日・同じ追跡番号なら「まとめて入管へ郵送した」で一度に）。全部郵送してタスクも済むと、ここから消えます。
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
                  />
                </div>
              )}
              <ul className="mt-2 space-y-1">
                {openTasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-background px-2.5 py-1.5 text-xs">
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
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
