import type { SupabaseClient } from "@supabase/supabase-js";
import { sortTravels, type WorkerTravel, type WorkerTravelInput } from "@/lib/worker-travel";

// 出入国の記録（パスポートのスタンプの日付）。古い順（1回目→2回目…）で返す
export async function listWorkerTravels(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerTravel[]> {
  const { data, error } = await supabase
    .from("worker_travels")
    .select("*")
    .eq("worker_id", workerId);
  if (error) throw error;
  return sortTravels((data as WorkerTravel[]) ?? []);
}

export async function insertWorkerTravel(
  supabase: SupabaseClient,
  workerId: string,
  input: WorkerTravelInput,
): Promise<void> {
  const { error } = await supabase
    .from("worker_travels")
    .insert({ ...input, worker_id: workerId });
  if (error) throw error;
}

export async function deleteWorkerTravel(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_travels").delete().eq("id", id);
  if (error) throw error;
}

// パスポートのスタンプページなどの添付ファイル（メタデータ）。新しい順
export interface WorkerPassportFileRow {
  id: string;
  worker_id: string;
  kind: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string; // 添付した日付はここに自動で残る
}

export async function listWorkerPassportFiles(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerPassportFileRow[]> {
  const { data, error } = await supabase
    .from("worker_passport_files")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerPassportFileRow[]) ?? [];
}
