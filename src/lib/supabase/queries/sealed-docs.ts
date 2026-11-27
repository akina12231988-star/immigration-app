import type { SupabaseClient } from "@supabase/supabase-js";

// ---- 会社に印鑑をもらう書類の押印後の控えリンク（0237_sealed_docs.sql） ----
// kind は参考様式のキーと同じ（shien-itaku / t1-5 / t1-6-1）

export interface WorkerSealedDoc {
  kind: string;
  drive_url: string;
  sealed: boolean; // 会社の印鑑をもらったか
  note: string;
}

export async function listWorkerSealedDocs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<WorkerSealedDoc[]> {
  const { data, error } = await supabase
    .from("worker_sealed_docs")
    .select("kind, drive_url, sealed, note")
    .eq("worker_id", workerId);
  if (error) throw error;
  return (data as WorkerSealedDoc[]) ?? [];
}

export async function upsertWorkerSealedDoc(
  supabase: SupabaseClient,
  workerId: string,
  kind: string,
  patch: { drive_url?: string; sealed?: boolean; note?: string },
): Promise<void> {
  const { error } = await supabase
    .from("worker_sealed_docs")
    .upsert({ worker_id: workerId, kind, ...patch }, { onConflict: "worker_id,kind" });
  if (error) throw error;
}
