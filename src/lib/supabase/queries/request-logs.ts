import type { SupabaseClient } from "@supabase/supabase-js";

// 外国人ごとの対応の記録（いつ本人から依頼があって、いつ何をやったか。0131）

// 記録の種別。依頼と対応を分けて、時系列で流れを追えるようにする
export const WORKER_REQUEST_LOG_KINDS = ["本人からの依頼", "対応したこと"] as const;
export type WorkerRequestLogKind = (typeof WORKER_REQUEST_LOG_KINDS)[number];

export interface WorkerRequestLog {
  id: string;
  worker_id: string;
  logged_on: string; // いつ（YYYY-MM-DD）
  kind: string; // 本人からの依頼 ／ 対応したこと
  content: string;
  created_at: string;
}

// その外国人の記録を新しい順（日付の新しい順・同日は登録の新しい順）で取得
export async function listWorkerRequestLogs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerRequestLog[]> {
  const { data, error } = await supabase
    .from("worker_request_logs")
    .select("id, worker_id, logged_on, kind, content, created_at")
    .eq("worker_id", workerId)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerRequestLog[]) ?? [];
}

export async function insertWorkerRequestLog(
  supabase: SupabaseClient,
  input: { worker_id: string; logged_on: string; kind: string; content: string },
): Promise<WorkerRequestLog> {
  const { data, error } = await supabase
    .from("worker_request_logs")
    .insert(input)
    .select("id, worker_id, logged_on, kind, content, created_at")
    .single();
  if (error) throw error;
  return data as WorkerRequestLog;
}

export async function deleteWorkerRequestLog(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_request_logs").delete().eq("id", id);
  if (error) throw error;
}
