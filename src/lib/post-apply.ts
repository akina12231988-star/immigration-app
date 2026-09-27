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

// 入管へ郵送した記録（1回の投函ぶん。まとめて送ったときは書類が複数）
export interface PostApplyMailing {
  id: string;
  doc_ids: string[]; // 郵送した書類
  posted_on: string; // 投函日（YYYY-MM-DD）
  tracking: string; // 追跡番号
}

// 保存されている値（jsonb）を正規化。0168未適用・壊れた値は空配列
export function normalizePostApplyMailings(raw: unknown): PostApplyMailing[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m, i) => ({
      id: typeof m.id === "string" && m.id ? m.id : `m${i}`,
      doc_ids: Array.isArray(m.doc_ids) ? m.doc_ids.filter((d): d is string => typeof d === "string") : [],
      posted_on: typeof m.posted_on === "string" ? m.posted_on : "",
      tracking: typeof m.tracking === "string" ? m.tracking : "",
    }))
    .filter((m) => m.doc_ids.length > 0);
}

export function newPostApplyMailing(docIds: string[], postedOn: string, tracking: string): PostApplyMailing {
  return {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    doc_ids: [...docIds],
    posted_on: postedOn,
    tracking: tracking.trim(),
  };
}

// その書類を郵送した記録（無ければ null）
export function mailingOf(docId: string, mailings: PostApplyMailing[]): PostApplyMailing | null {
  return mailings.find((m) => m.doc_ids.includes(docId)) ?? null;
}

// まだ郵送していない書類
export function unmailedDocIds(docIds: string[], mailings: PostApplyMailing[]): string[] {
  return docIds.filter((d) => !mailingOf(d, mailings));
}

// 郵送の記録から書類を外す（取り消し）。書類が残らない記録は消す
export function removeDocFromMailings(docId: string, mailings: PostApplyMailing[]): PostApplyMailing[] {
  return mailings
    .map((m) => ({ ...m, doc_ids: m.doc_ids.filter((d) => d !== docId) }))
    .filter((m) => m.doc_ids.length > 0);
}

export function newPostApplyTask(text: string): PostApplyTask {
  return { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), done: false };
}

// 書類IDの表示名
export function prepDocLabel(docId: string): string {
  return PREP_DOC_DEFS.find((d) => d.id === docId)?.label ?? docId;
}

// 項目（書類・タスク）ごとのメモ。例：「現在発行手続き中との連絡あり」（0172）
export interface PostApplyNote {
  id: string;
  text: string;
  on: string; // 書いた日（YYYY-MM-DD）
  by: string; // 記入者
}

// キーは項目（書類は "doc:<書類ID>"、タスクは "task:<タスクID>"）
export type PostApplyNotes = Record<string, PostApplyNote[]>;

export const postApplyDocKey = (docId: string) => `doc:${docId}`;
export const postApplyTaskKey = (taskId: string) => `task:${taskId}`;

// 保存されている値（jsonb）を正規化。0172未適用・壊れた値は空
export function normalizePostApplyNotes(raw: unknown): PostApplyNotes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PostApplyNotes = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const notes = list
      .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
      .map((n, i) => ({
        id: typeof n.id === "string" && n.id ? n.id : `n${i}`,
        text: typeof n.text === "string" ? n.text : "",
        on: typeof n.on === "string" ? n.on : "",
        by: typeof n.by === "string" ? n.by : "",
      }))
      .filter((n) => n.text.trim() !== "");
    if (notes.length > 0) out[key] = notes;
  }
  return out;
}

// メモを1件足す（新しいものを下に）
export function addPostApplyNote(
  notes: PostApplyNotes,
  key: string,
  text: string,
  on: string,
  by: string,
): PostApplyNotes {
  const note: PostApplyNote = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: text.trim(),
    on,
    by,
  };
  return { ...notes, [key]: [...(notes[key] ?? []), note] };
}

// メモを1件消す。空になった項目はキーごと消す
export function removePostApplyNote(notes: PostApplyNotes, key: string, noteId: string): PostApplyNotes {
  const rest = (notes[key] ?? []).filter((n) => n.id !== noteId);
  const next = { ...notes };
  if (rest.length > 0) next[key] = rest;
  else delete next[key];
  return next;
}

// 申請一覧に出す1人（準備リスト1件）ぶん
export interface PostApplyEntry {
  checklistId: string;
  workerId: string;
  workerName: string;
  todoNo: string;
  docIds: string[]; // 申請後に入管へ郵送する書類（郵送済みも含む）
  mailings: PostApplyMailing[]; // 入管へ郵送した記録
  tasks: PostApplyTask[]; // そのほかのタスク（済みも含む）
  notes: PostApplyNotes; // 項目ごとのメモ（0172）
}

// 残っている件数（まだ郵送していない書類＋済みでないタスク）
export function openPostApplyCount(e: Pick<PostApplyEntry, "docIds" | "tasks"> & { mailings?: PostApplyMailing[] }): number {
  return unmailedDocIds(e.docIds, e.mailings ?? []).length + e.tasks.filter((t) => !t.done).length;
}

// 郵送する書類かタスクがある準備リストだけを、残りの多い順→氏名順に並べる
export function buildPostApplyEntries(
  checklists: {
    id: string;
    worker_id: string;
    todo_no?: string | null;
    post_apply_tasks?: unknown;
    post_apply_mailings?: unknown;
    post_apply_notes?: unknown;
  }[],
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
      mailings: normalizePostApplyMailings(c.post_apply_mailings),
      tasks: normalizePostApplyTasks(c.post_apply_tasks),
      notes: normalizePostApplyNotes(c.post_apply_notes),
    }))
    .filter((e) => openPostApplyCount(e) > 0);
  return entries.sort(
    (a, b) => openPostApplyCount(b) - openPostApplyCount(a) || a.workerName.localeCompare(b.workerName, "ja"),
  );
}
