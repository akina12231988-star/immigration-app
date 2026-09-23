// 申請後に入管へ郵送する書類（申請準備の「申請後に発行され次第、入管へ郵送する」）と、
// そのほかのタスク（テキスト）をまとめる。
// 申請準備の「申請後に入管へ郵送するリスト」、申請一覧の「申請後の郵送・タスク」、申請詳細のアラートで使う。

import { PREP_DOC_DEFS } from "@/lib/application-prep";

export interface PostApplyTask {
  id: string;
  text: string;
  done: boolean;
}

// 保存されている値（jsonb）を正規化。0167未適用・壊れた値は空配列
export function normalizePostApplyTasks(raw: unknown): PostApplyTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t, i) => ({
      id: typeof t.id === "string" && t.id ? t.id : `t${i}`,
      text: typeof t.text === "string" ? t.text : "",
      done: t.done === true,
    }))
    .filter((t) => t.text.trim() !== "");
}

export function newPostApplyTask(text: string): PostApplyTask {
  return { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), done: false };
}

// 書類IDの表示名
export function prepDocLabel(docId: string): string {
  return PREP_DOC_DEFS.find((d) => d.id === docId)?.label ?? docId;
}

// 申請一覧に出す1人（準備リスト1件）ぶん
export interface PostApplyEntry {
  checklistId: string;
  workerId: string;
  workerName: string;
  todoNo: string;
  docIds: string[]; // 申請後に入管へ郵送する書類
  tasks: PostApplyTask[]; // そのほかのタスク（済みも含む）
}

// 残っている件数（郵送する書類＋済みでないタスク）
export function openPostApplyCount(e: Pick<PostApplyEntry, "docIds" | "tasks">): number {
  return e.docIds.length + e.tasks.filter((t) => !t.done).length;
}

// 郵送する書類かタスクがある準備リストだけを、残りの多い順→氏名順に並べる
export function buildPostApplyEntries(
  checklists: { id: string; worker_id: string; todo_no?: string | null; post_apply_tasks?: unknown }[],
  mailDocs: { checklist_id: string; doc_id: string }[],
  nameById: Map<string, string>,
): PostApplyEntry[] {
  const docsByList = new Map<string, string[]>();
  for (const d of mailDocs) {
    docsByList.set(d.checklist_id, [...(docsByList.get(d.checklist_id) ?? []), d.doc_id]);
  }
  const entries: PostApplyEntry[] = checklists
    .map((c) => ({
      checklistId: c.id,
      workerId: c.worker_id,
      workerName: nameById.get(c.worker_id) ?? "",
      todoNo: c.todo_no ?? "",
      docIds: docsByList.get(c.id) ?? [],
      tasks: normalizePostApplyTasks(c.post_apply_tasks),
    }))
    .filter((e) => openPostApplyCount(e) > 0);
  return entries.sort(
    (a, b) => openPostApplyCount(b) - openPostApplyCount(a) || a.workerName.localeCompare(b.workerName, "ja"),
  );
}
