import type { SupabaseClient } from "@supabase/supabase-js";
import type { PassportRenewalGuide } from "@/lib/passport-renewal";

// パスポート更新案内の進捗（0126_passport_renewal_guides.sql）。
// テーブル未適用（42P01/PGRST205）のときは空で返し、画面は「未案内」のまま
// 動く（保存時にマイグレーション名入りの案内を出す）。

export async function listPassportRenewalGuides(
  supabase: SupabaseClient,
): Promise<PassportRenewalGuide[]> {
  const { data, error } = await supabase
    .from("passport_renewal_guides")
    .select("worker_id, guided_on, guided_expiry");
  if (error) throw error;
  return (data as PassportRenewalGuide[]) ?? [];
}

// 案内した日を保存（外国人ごとに1件を upsert）。
// guided_expiry には「今のパスポート有効期限」を控えとして一緒に入れる
export async function upsertPassportRenewalGuide(
  supabase: SupabaseClient,
  workerId: string,
  guidedOn: string | null,
  guidedExpiry: string | null,
): Promise<void> {
  const { error } = await supabase.from("passport_renewal_guides").upsert(
    {
      worker_id: workerId,
      guided_on: guidedOn,
      guided_expiry: guidedExpiry,
    },
    { onConflict: "worker_id" },
  );
  if (error) throw error;
}
