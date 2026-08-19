import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationExtraRequest,
  ApplicationExtraRequestInput,
} from "@/types/application";

// ---- 追加資料の提出依頼（0083_application_extra_requests.sql） ----
//
// 審査中に入管から来る追加資料の依頼を、申請ごとに記録する。
// 依頼が来た日の新しい順に並べる。

export async function listExtraRequests(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<ApplicationExtraRequest[]> {
  const { data, error } = await supabase
    .from("application_extra_requests")
    .select("*")
    .eq("application_id", applicationId)
    .order("requested_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ApplicationExtraRequest[]) ?? [];
}

// 申請一覧の「＜入管＞追加資料」タブ用に、全申請ぶんの依頼をまとめて取る。
// 件数が多くないので絞り込みは画面側で行う（完了した分も履歴として出す）。
export async function listAllExtraRequests(
  supabase: SupabaseClient,
): Promise<ApplicationExtraRequest[]> {
  const { data, error } = await supabase
    .from("application_extra_requests")
    .select("*")
    .order("requested_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ApplicationExtraRequest[]) ?? [];
}

export async function insertExtraRequest(
  supabase: SupabaseClient,
  input: ApplicationExtraRequestInput,
): Promise<ApplicationExtraRequest> {
  const { data, error } = await supabase
    .from("application_extra_requests")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ApplicationExtraRequest;
}

export async function updateExtraRequest(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ApplicationExtraRequestInput>,
): Promise<void> {
  const { error } = await supabase
    .from("application_extra_requests")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteExtraRequest(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("application_extra_requests").delete().eq("id", id);
  if (error) throw error;
}
