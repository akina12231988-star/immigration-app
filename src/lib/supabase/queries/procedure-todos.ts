import type { SupabaseClient } from "@supabase/supabase-js";
import { insertTodo, updateTodo } from "@/lib/supabase/queries/todos";
import {
  PROCEDURE_TITLES,
  PROCEDURE_TODO_KIND,
  type ProcedureKey,
  type ProcedureStatus,
  type ProcedureTodo,
} from "@/lib/procedure-todo";

// 住所・保険の手続きのTODO（0217）の読み書き

function toProcedureTodo(r: Record<string, unknown>): ProcedureTodo {
  return {
    id: String(r.id),
    todo_no: String(r.todo_no ?? ""),
    title: String(r.title ?? ""),
    status: String(r.status ?? "未着手"),
    note: String(r.note ?? ""),
    requested_to: typeof r.requested_to === "string" ? r.requested_to : "",
    requested_on: typeof r.requested_on === "string" ? r.requested_on : null,
    deleted_at: typeof r.deleted_at === "string" ? r.deleted_at : null,
    created_at: String(r.created_at ?? ""),
  };
}

export async function listProcedureTodos(supabase: SupabaseClient, workerId: string): Promise<ProcedureTodo[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("kind", PROCEDURE_TODO_KIND)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(toProcedureTodo);
}

// 手続きのTODOを作る（依頼先・依頼日も入れる）
export async function createProcedureTodo(
  supabase: SupabaseClient,
  workerId: string,
  key: ProcedureKey,
  init: { status?: ProcedureStatus; requested_to?: string; requested_on?: string | null } = {},
): Promise<ProcedureTodo> {
  const row = await insertTodo(supabase, {
    kind: PROCEDURE_TODO_KIND,
    worker_id: workerId,
    title: PROCEDURE_TITLES[key],
    status: init.status ?? "未着手",
  });
  if (init.requested_to || init.requested_on) {
    await updateTodo(supabase, row.id, { requested_to: init.requested_to ?? "", requested_on: init.requested_on ?? null });
  }
  return toProcedureTodo({ ...row, requested_to: init.requested_to ?? "", requested_on: init.requested_on ?? null } as unknown as Record<string, unknown>);
}

// 外国人詳細のチェック（followups）が付いていて、まだTODOが無い人（まとめて取り込む用）
export async function listWorkersWithFollowups(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string; followups: unknown }[]> {
  const { data, error } = await supabase.from("workers").select("id, name, followups").not("followups", "is", null);
  if (error) throw error;
  return (data as { id: string; name: string; followups: unknown }[] | null) ?? [];
}

export async function listAllProcedureTodos(supabase: SupabaseClient): Promise<(ProcedureTodo & { worker_id: string | null })[]> {
  const { data, error } = await supabase.from("todos").select("*").eq("kind", PROCEDURE_TODO_KIND);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    ...toProcedureTodo(r),
    worker_id: typeof r.worker_id === "string" ? r.worker_id : null,
  }));
}

// 住所歴に転入日を登録して転居が済んだときに、残っている転出手続き・転入手続きのTODOを完了にする
export async function completeOpenMovingTodos(supabase: SupabaseClient, workerId: string): Promise<number> {
  const list = await listProcedureTodos(supabase, workerId);
  const open = list.filter(
    (t) =>
      !t.deleted_at &&
      (t.title === PROCEDURE_TITLES.moveOut || t.title === PROCEDURE_TITLES.moveIn) &&
      t.status !== "完了" &&
      t.status !== "キャンセル",
  );
  for (const t of open) await updateTodo(supabase, t.id, { status: "完了" });
  return open.length;
}
