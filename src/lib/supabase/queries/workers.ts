import type { SupabaseClient } from "@supabase/supabase-js";
import type { Worker, WorkerInput, WorkerWithHistories } from "@/types/db";

// 一覧用: 全外国人＋職歴を一括取得（通算計算はクライアント側で行う）
export async function listWorkersWithHistories(
  supabase: SupabaseClient,
): Promise<WorkerWithHistories[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("*, work_histories(*)")
    .order("created_at", { ascending: true })
    .order("start_date", { referencedTable: "work_histories", ascending: true });
  if (error) throw error;
  return (data as WorkerWithHistories[]) ?? [];
}

export async function getWorkerWithHistories(
  supabase: SupabaseClient,
  id: string,
): Promise<WorkerWithHistories | null> {
  const { data, error } = await supabase
    .from("workers")
    .select("*, work_histories(*)")
    .eq("id", id)
    .order("start_date", { referencedTable: "work_histories", ascending: true })
    .maybeSingle();
  if (error) throw error;
  return data as WorkerWithHistories | null;
}

export async function insertWorker(
  supabase: SupabaseClient,
  input: WorkerInput,
): Promise<Worker> {
  const { data, error } = await supabase
    .from("workers")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(
  supabase: SupabaseClient,
  id: string,
  input: Partial<WorkerInput>,
): Promise<Worker> {
  const { data, error } = await supabase
    .from("workers")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

// 職歴は on delete cascade で同時に削除される
export async function deleteWorker(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("workers").delete().eq("id", id);
  if (error) throw error;
}
