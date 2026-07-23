import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerAddress } from "@/lib/worker-address";

export async function listWorkerAddresses(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerAddress[]> {
  const { data, error } = await supabase
    .from("worker_addresses")
    .select("*")
    .eq("worker_id", workerId)
    .order("moved_on", { ascending: false });
  if (error) throw error;
  return (data as WorkerAddress[]) ?? [];
}

export async function insertWorkerAddress(
  supabase: SupabaseClient,
  input: { worker_id: string; moved_on: string; address: string; kind: string; note: string },
): Promise<WorkerAddress> {
  const { data, error } = await supabase
    .from("worker_addresses")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as WorkerAddress;
}

export async function deleteWorkerAddress(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_addresses").delete().eq("id", id);
  if (error) throw error;
}
