import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTodoKey } from "@/lib/todo";

// 支援計画書 日付計算の保存結果（support_plan_dates。0107）。
// 外国人×TODO番号で1件持ち、日付計算・申請準備のTODOのどちらからでも編集できる。

export interface SavedPlanDates {
  id: string;
  worker_id: string | null;
  todo_no: string;
  name: string;
  org: string;
  is_legal: boolean;
  inputs: Record<string, string>; // 選んだ日付（es/ap/ci/di/hi）
  dates: Record<string, string>; // 日付一覧（PLAN_DATE_FIELDS のキー → YYYY-MM-DD）
  updated_at: string;
}

// 外国人の保存済みの日付一覧（新しい順）
export async function listPlanDates(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SavedPlanDates[]> {
  const { data, error } = await supabase
    .from("support_plan_dates")
    .select("*")
    .eq("worker_id", workerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as SavedPlanDates[]) ?? [];
}

// TODO番号に対応する保存結果（番号の書き方の揺れは正規化して突き合わせる）
export function findPlanDatesForTodo(
  rows: SavedPlanDates[],
  todoNo: string,
): SavedPlanDates | null {
  const key = normalizeTodoKey(todoNo);
  if (key) {
    const hit = rows.find((r) => normalizeTodoKey(r.todo_no) === key);
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

// 保存（同じ外国人×TODO番号があれば上書き）
export async function upsertPlanDates(
  supabase: SupabaseClient,
  input: Omit<SavedPlanDates, "id" | "updated_at">,
): Promise<void> {
  const { error } = await supabase
    .from("support_plan_dates")
    .upsert(input, { onConflict: "worker_id,todo_no" });
  if (error) throw error;
}

// 日付一覧だけをあとから編集して保存する
export async function updatePlanDates(
  supabase: SupabaseClient,
  id: string,
  dates: Record<string, string>,
): Promise<void> {
  const { error } = await supabase.from("support_plan_dates").update({ dates }).eq("id", id);
  if (error) throw error;
}
