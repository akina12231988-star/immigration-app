import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_HEALTH_DETAIL, type HealthCheckDetail, type HealthFormType } from "@/lib/health-check";

// 健康診断書の詳細（受診項目チェック・就労可の後日結果）を外国人ごとに取得。無ければ空。
export async function getHealthCheckDetail(
  supabase: SupabaseClient,
  workerId: string,
): Promise<HealthCheckDetail> {
  const { data, error } = await supabase
    .from("health_check_details")
    .select("form_type, checked_items, needs_followup, followup_memo, followup_result")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...EMPTY_HEALTH_DETAIL };
  const row = data as HealthCheckDetail;
  return {
    form_type: (row.form_type ?? "") as HealthFormType,
    checked_items: row.checked_items ?? "",
    needs_followup: row.needs_followup ?? false,
    followup_memo: row.followup_memo ?? "",
    followup_result: row.followup_result ?? "",
  };
}

export async function upsertHealthCheckDetail(
  supabase: SupabaseClient,
  workerId: string,
  detail: HealthCheckDetail,
): Promise<void> {
  const { error } = await supabase
    .from("health_check_details")
    .upsert({ worker_id: workerId, ...detail }, { onConflict: "worker_id" });
  if (error) throw error;
}
