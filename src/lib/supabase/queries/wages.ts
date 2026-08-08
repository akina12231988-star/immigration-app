import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerWage, WorkerWageInput } from "@/types/db";

// ---- 賃金の記録（worker_wages） ----
// 昇給のたびに1行増やし、適用開始日がいちばん新しい行を現在の賃金として扱う

export async function listWorkerWages(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerWage[]> {
  const { data, error } = await supabase
    .from("worker_wages")
    .select("*")
    .eq("worker_id", workerId)
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerWage[]) ?? [];
}

// 所属機関の在籍者一覧で「今いくらか」を出すため、機関の全員分をまとめて取る
export async function listWagesByOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<WorkerWage[]> {
  const { data, error } = await supabase
    .from("worker_wages")
    .select("*")
    .eq("organization_id", organizationId)
    .order("started_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerWage[]) ?? [];
}

export async function insertWorkerWage(
  supabase: SupabaseClient,
  input: WorkerWageInput,
): Promise<WorkerWage> {
  const { data, error } = await supabase
    .from("worker_wages")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as WorkerWage;
}

export async function updateWorkerWage(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<WorkerWageInput>,
): Promise<void> {
  const { error } = await supabase.from("worker_wages").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkerWage(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_wages").delete().eq("id", id);
  if (error) throw error;
}
