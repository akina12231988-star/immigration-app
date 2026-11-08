import type { SupabaseClient } from "@supabase/supabase-js";
import { insertTodo } from "@/lib/supabase/queries/todos";
import {
  PROCEDURE_TITLES,
  PROCEDURE_TODO_KIND,
  PROCEDURE_TODO_TITLE,
  currentProcedureTodo,
  normalizeProcedureSteps,
  procedureOverallStatus,
  type ProcedureSteps,
  type ProcedureTodo,
} from "@/lib/procedure-todo";

// 住所・保険の手続きのTODO（1人1件・中に手続きごとの経過。0217・0219）の読み書き

function toProcedureTodo(r: Record<string, unknown>): ProcedureTodo {
  return {
    id: String(r.id),
    todo_no: String(r.todo_no ?? ""),
    title: String(r.title ?? ""),
    status: String(r.status ?? "未着手"),
    steps: normalizeProcedureSteps(r.procedure_steps),
    deleted_at: typeof r.deleted_at === "string" ? r.deleted_at : null,
    created_at: String(r.created_at ?? ""),
  };
}

// 0217 の手続きごとの古いTODO（0219 でまとめる前のもの）は読まない
const OLD_TITLES = Object.values(PROCEDURE_TITLES) as string[];

export async function getProcedureTodo(supabase: SupabaseClient, workerId: string): Promise<ProcedureTodo | null> {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("kind", PROCEDURE_TODO_KIND)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = ((data as Record<string, unknown>[] | null) ?? [])
    .filter((r) => !OLD_TITLES.includes(String(r.title ?? "")))
    .map(toProcedureTodo);
  return currentProcedureTodo(rows);
}

// 手続きを保存する（無ければTODOを作る）。TODOの経過は中の手続きから決める
export async function saveProcedureSteps(
  supabase: SupabaseClient,
  workerId: string,
  todo: ProcedureTodo | null,
  steps: ProcedureSteps,
): Promise<ProcedureTodo> {
  const status = procedureOverallStatus(steps);
  if (!todo) {
    const row = await insertTodo(supabase, {
      kind: PROCEDURE_TODO_KIND,
      worker_id: workerId,
      title: PROCEDURE_TODO_TITLE,
      status,
    });
    const { error } = await supabase.from("todos").update({ procedure_steps: steps }).eq("id", row.id);
    if (error) {
      // 0219 が未適用（procedure_steps の列が無い）なら、作ったTODOは消して空のTODOを残さない
      await supabase.from("todos").delete().eq("id", row.id);
      throw error;
    }
    return toProcedureTodo({ ...row, procedure_steps: steps } as unknown as Record<string, unknown>);
  }
  const { error } = await supabase
    .from("todos")
    .update({ procedure_steps: steps, status, updated_at: new Date().toISOString() })
    .eq("id", todo.id);
  if (error) throw error;
  return { ...todo, steps, status };
}

// 外国人詳細のチェック（followups）が付いている人（まとめて取り込む用）
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
  return ((data as Record<string, unknown>[] | null) ?? [])
    .filter((r) => !OLD_TITLES.includes(String(r.title ?? "")))
    .map((r) => ({ ...toProcedureTodo(r), worker_id: typeof r.worker_id === "string" ? r.worker_id : null }));
}

// 住所歴に転入日を登録して転居が済んだときに、残っている転出手続き・転入手続きを完了にする
export async function completeOpenMovingTodos(supabase: SupabaseClient, workerId: string): Promise<number> {
  const todo = await getProcedureTodo(supabase, workerId);
  if (!todo) return 0;
  let n = 0;
  const steps: ProcedureSteps = { ...todo.steps };
  for (const k of ["moveOut", "moveIn"] as const) {
    const s = steps[k];
    if (s && s.status !== "完了" && s.status !== "キャンセル") {
      steps[k] = { ...s, status: "完了" };
      n += 1;
    }
  }
  if (n > 0) await saveProcedureSteps(supabase, workerId, todo, steps);
  return n;
}

