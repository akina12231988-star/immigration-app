import type { SupabaseClient } from "@supabase/supabase-js";
import { pendingWagePatch } from "@/lib/wage";
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

// 雇用開始になったとき、申請時に入れた賃金（適用開始日が空）に雇用開始日を書き込み、
// 理由「申請時」を「採用時」に変える。書き込んだ記録を返す（無ければ空）
export async function applyEmploymentStartToWages(
  supabase: SupabaseClient,
  wages: WorkerWage[],
  employmentStartOn: string | null | undefined,
): Promise<WorkerWage[]> {
  const updated: WorkerWage[] = [];
  for (const w of wages) {
    const patch = pendingWagePatch(w, employmentStartOn);
    if (!patch) continue;
    await updateWorkerWage(supabase, w.id, patch);
    updated.push({ ...w, ...patch });
  }
  return updated;
}

export async function deleteWorkerWage(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_wages").delete().eq("id", id);
  if (error) throw error;
}
