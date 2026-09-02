import type { SupabaseClient } from "@supabase/supabase-js";

// 外国人ごとの対応の記録（0131）。参考様式第５－４号「相談記録書」の1行に
// そのまま写せるよう、1件＝1件の相談として相談内容と対応結果を持つ（0132）。

// 0131 のときの種別。今は使わないが、当時の記録を見分けるために残している
export const WORKER_REQUEST_LOG_KINDS = ["本人からの依頼", "対応したこと"] as const;
export type WorkerRequestLogKind = (typeof WORKER_REQUEST_LOG_KINDS)[number];

// 新しく作る記録の種別（相談記録書の「相談者」＝本人からの申出）
export const CONSULTATION_KIND: WorkerRequestLogKind = "本人からの依頼";

const COLUMNS =
  "id, worker_id, organization_id, logged_on, kind, content, result, handler_name, is_consultation, created_at";

export interface WorkerRequestLog {
  id: string;
  worker_id: string;
  organization_id: string | null; // 記録した時点の所属機関
  logged_on: string; // 相談受理日（YYYY-MM-DD）
  kind: string; // 0131 のときの種別
  content: string; // 相談内容
  result: string; // 対応結果（あとから追記できる）
  handler_name: string; // 対応者の氏名
  is_consultation: boolean; // 相談記録書に載せるか
  created_at: string;
}

export interface WorkerRequestLogInput {
  logged_on: string;
  content: string;
  result: string;
  handler_name: string;
  is_consultation: boolean;
}

// その外国人の記録を新しい順（日付の新しい順・同日は登録の新しい順）で取得
export async function listWorkerRequestLogs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerRequestLog[]> {
  const { data, error } = await supabase
    .from("worker_request_logs")
    .select(COLUMNS)
    .eq("worker_id", workerId)
    .order("logged_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as WorkerRequestLog[]) ?? [];
}

export async function insertWorkerRequestLog(
  supabase: SupabaseClient,
  input: WorkerRequestLogInput & { worker_id: string; organization_id: string | null },
): Promise<WorkerRequestLog> {
  const { data, error } = await supabase
    .from("worker_request_logs")
    .insert({ ...input, kind: CONSULTATION_KIND })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as WorkerRequestLog;
}

// 記録を直す（対応結果はあとから書き足すことが多いので編集できるようにする）
export async function updateWorkerRequestLog(
  supabase: SupabaseClient,
  id: string,
  patch: WorkerRequestLogInput,
): Promise<WorkerRequestLog> {
  const { data, error } = await supabase
    .from("worker_request_logs")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
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
