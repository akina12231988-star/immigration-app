import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OnboardingDocumentRow,
  OnboardingFollowupRow,
  OnboardingRecordRow,
} from "@/types/db";

// ---- 入社書類メール（onboarding_records / onboarding_documents） ----

export async function getOnboardingRecord(
  supabase: SupabaseClient,
  workerId: string,
): Promise<OnboardingRecordRow | null> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .select("*")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (error) throw error;
  return data as OnboardingRecordRow | null;
}

export type OnboardingRecordInput = Omit<
  OnboardingRecordRow,
  "id" | "created_by" | "created_at" | "updated_at"
>;

export async function upsertOnboardingRecord(
  supabase: SupabaseClient,
  input: OnboardingRecordInput,
): Promise<OnboardingRecordRow> {
  const { data, error } = await supabase
    .from("onboarding_records")
    .upsert(input, { onConflict: "worker_id" })
    .select()
    .single();
  if (error) throw error;
  return data as OnboardingRecordRow;
}

export async function listOnboardingDocs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<OnboardingDocumentRow[]> {
  const { data, error } = await supabase
    .from("onboarding_documents")
    .select("*")
    .eq("worker_id", workerId)
    .order("sort_no", { ascending: true });
  if (error) throw error;
  return (data as OnboardingDocumentRow[]) ?? [];
}

// 書類ステータスの一括保存（ファイル関連の列はアップロード時に別途更新するため触らない）
export interface OnboardingDocStatusInput {
  worker_id: string;
  doc_key: string;
  label: string;
  sort_no: number;
  status: OnboardingDocumentRow["status"];
  note: string;
  due_on: string | null;
  received_on: string | null;
  pending_since: string | null; // 後送・未入手にした日（経過日数アラートの起点）
}

export async function upsertOnboardingDocStatuses(
  supabase: SupabaseClient,
  inputs: OnboardingDocStatusInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  const { error } = await supabase
    .from("onboarding_documents")
    .upsert(inputs, { onConflict: "worker_id,doc_key" });
  if (error) throw error;
}

// 本人が送ってきた（後送・未入手アラート解除）
export async function markOnboardingDocReceived(
  supabase: SupabaseClient,
  docId: string,
  receivedOn: string,
): Promise<void> {
  const { error } = await supabase
    .from("onboarding_documents")
    .update({ received_on: receivedOn })
    .eq("id", docId);
  if (error) throw error;
}

// ---- 訂正・追送メールの送付履歴（onboarding_followups） ----

export async function listOnboardingFollowups(
  supabase: SupabaseClient,
  workerId: string,
): Promise<OnboardingFollowupRow[]> {
  const { data, error } = await supabase
    .from("onboarding_followups")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as OnboardingFollowupRow[]) ?? [];
}

export type OnboardingFollowupInput = Omit<OnboardingFollowupRow, "id" | "created_at">;

export async function insertOnboardingFollowup(
  supabase: SupabaseClient,
  input: OnboardingFollowupInput,
): Promise<OnboardingFollowupRow> {
  const { data, error } = await supabase
    .from("onboarding_followups")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as OnboardingFollowupRow;
}

export async function deleteOnboardingFollowup(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("onboarding_followups").delete().eq("id", id);
  if (error) throw error;
}

// 未提出アラート: 後送・未入手のまま本人からまだ届いていない書類（外国人名つき）
export interface PendingOnboardingDoc extends OnboardingDocumentRow {
  workers: { name: string } | null;
}

export async function listPendingOnboardingDocs(
  supabase: SupabaseClient,
): Promise<PendingOnboardingDoc[]> {
  const { data, error } = await supabase
    .from("onboarding_documents")
    .select("*, workers(name)")
    .in("status", ["後送", "未入手"])
    .is("received_on", null)
    .order("worker_id", { ascending: true })
    .order("sort_no", { ascending: true });
  if (error) throw error;
  return (data as PendingOnboardingDoc[]) ?? [];
}
