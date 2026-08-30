import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerInsuranceCardRow } from "@/lib/insurance-card";

// 保険証（健康保険）の記録（0129）。新しい順（先頭が「現在の保険証」）
export async function listWorkerInsuranceCards(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerInsuranceCardRow[]> {
  const { data, error } = await supabase
    .from("worker_insurance_cards")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerInsuranceCardRow[]) ?? [];
}
