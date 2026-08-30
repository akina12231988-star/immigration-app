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

// 住所歴の根拠の添付ファイル（メタデータ。実体は app-files バケット。0128）。古い順
export interface WorkerAddressFileRow {
  id: string;
  worker_id: string;
  address_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string; // 添付した日付はここに自動で残る
}

export async function listWorkerAddressFiles(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerAddressFileRow[]> {
  const { data, error } = await supabase
    .from("worker_address_files")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as WorkerAddressFileRow[]) ?? [];
}

// 住所歴の1行を修正し、実際に直った件数を返す。
// 権限（RLS）が足りないと、エラーにならず0件のことがあるため件数で判断する
export async function updateWorkerAddress(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<WorkerAddress, "moved_on" | "address" | "kind" | "note">>,
): Promise<number> {
  const { data, error } = await supabase
    .from("worker_addresses")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return ((data as { id: string }[] | null) ?? []).length;
}

// 住所歴を削除し、実際に消えた件数を返す。
// 権限（RLS）が足りないと、エラーにならず0件のことがあるため件数で判断する
export async function deleteWorkerAddress(
  supabase: SupabaseClient,
  id: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("worker_addresses")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return ((data as { id: string }[] | null) ?? []).length;
}
