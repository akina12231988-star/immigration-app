import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PREP_META, type PrepChecklistMeta } from "@/lib/application-prep";

// 申請準備チェックリストのメタ情報（申請種別・条件・対象年度）を外国人ごとに取得する。
// 行が無ければ空の既定値を返す。
export async function getPrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
): Promise<PrepChecklistMeta> {
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("app_type, has_kokuho, has_nenkin, target_reiwa, kenshin_items_ok")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...EMPTY_PREP_META };
  const row = data as PrepChecklistMeta;
  return {
    app_type: row.app_type ?? "",
    has_kokuho: row.has_kokuho ?? false,
    has_nenkin: row.has_nenkin ?? false,
    target_reiwa: row.target_reiwa ?? null,
    kenshin_items_ok: row.kenshin_items_ok ?? false,
  };
}

export async function upsertPrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
  meta: PrepChecklistMeta,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert({ worker_id: workerId, ...meta }, { onConflict: "worker_id" });
  if (error) throw error;
}
