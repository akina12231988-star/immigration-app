"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { newPostApplyTask, unmailedDocIds, type PostApplyMailing, type PostApplyTask } from "@/lib/post-apply";
import { PostApplyMailingPanel } from "@/components/workers/PostApplyMailingPanel";

// 申請準備の「申請後に入管へ郵送するリスト」。
// 書類の行で「申請後に発行され次第、入管へ郵送する」にチェックした書類をまとめ、
// そのほかに申請後にすること（タスク）をテキストで足せる。
// ここに出したものは申請一覧の「申請後の郵送・タスク」と、申請詳細のアラートにも出る。
export function PostApplyList({
  docIds,
  mailings,
  tasks,
  canEdit,
  onSaveMailings,
  onSaveTasks,
}: {
  docIds: string[];
  mailings: PostApplyMailing[]; // 入管へ郵送した記録（投函日・追跡番号）
  tasks: PostApplyTask[];
  canEdit: boolean;
  onSaveMailings: (mailings: PostApplyMailing[]) => void;
  onSaveTasks: (tasks: PostApplyTask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onSaveTasks([...tasks, newPostApplyTask(draft)]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-status-notice-fg/40 bg-status-notice-bg/30 p-3">
      <p className="text-sm font-bold">📮 申請後に入管へ郵送するリスト</p>
      <p className="mt-0.5 text-[11px] text-muted">
        書類の行で「申請後に発行され次第、入管へ郵送する」にチェックした書類と、そのほかに申請後にすることです。
        申請一覧の「申請後の郵送・タスク」と申請詳細にも出ます。郵送したら「入管へ郵送した」で投函日・追跡番号を記録してください（同じ日・同じ追跡番号なら「まとめて入管へ郵送した」で一度に入れられます）。済んだタスクはチェックを付けてください。
      </p>

      <p className="mt-2 text-[11px] font-bold text-muted">
        入管へ郵送する書類（{docIds.length}件・うち未郵送{unmailedDocIds(docIds, mailings).length}件）
      </p>
      <div className="mt-1">
        <PostApplyMailingPanel docIds={docIds} mailings={mailings} canEdit={canEdit} onSave={onSaveMailings} />
      </div>

      <p className="mt-3 text-[11px] font-bold text-muted">そのほかのタスク（{tasks.filter((t) => !t.done).length}件）</p>
      {tasks.length > 0 && (
        <ul className="mt-1 space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={t.done}
                disabled={!canEdit}
                onChange={(e) => onSaveTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: e.target.checked } : x)))}
                aria-label="済み"
                className="h-4 w-4 shrink-0"
              />
              <span className={`min-w-0 flex-1 break-words ${t.done ? "text-muted line-through" : ""}`}>{t.text}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onSaveTasks(tasks.filter((x) => x.id !== t.id))}
                  aria-label="タスクを削除"
                  className="shrink-0 text-muted hover:text-seal"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
            placeholder="例：理由書の原本を郵送する／本人に写真を送ってもらう"
            aria-label="申請後のタスク"
            className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none"
          />
          {draft && (
            <button type="button" onClick={() => setDraft("")} aria-label="入力を消す" className="text-muted">
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-2 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
          >
            <Plus size={12} />
            追加
          </button>
        </div>
      )}
    </div>
  );
}
