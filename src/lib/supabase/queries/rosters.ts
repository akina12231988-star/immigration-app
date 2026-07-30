import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerRoster, WorkerRosterInput } from "@/types/db";

// 外国人の労働者名簿を全件取得（会社ごとに1件・作成が新しい順）
export async function listWorkerRosters(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerRoster[]> {
  const { data, error } = await supabase
    .from("worker_rosters")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerRoster[]) ?? [];
}

export async function insertWorkerRoster(
  supabase: SupabaseClient,
  input: WorkerRosterInput,
): Promise<WorkerRoster> {
  const { data, error } = await supabase
    .from("worker_rosters")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as WorkerRoster;
}

export async function updateWorkerRoster(
  supabase: SupabaseClient,
  id: string,
  input: Omit<WorkerRosterInput, "worker_id">,
): Promise<void> {
  const { error } = await supabase.from("worker_rosters").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkerRoster(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_rosters").delete().eq("id", id);
  if (error) throw error;
}
