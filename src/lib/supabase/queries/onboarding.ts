import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingDocumentRow, OnboardingRecordRow } from "@/types/db";

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

// 本人が送ってきた（後送アラート解除）
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

// 後送アラート: 後送のまま本人からまだ届いていない書類（外国人名つき・期日昇順）
export interface PendingOnboardingDoc extends OnboardingDocumentRow {
  workers: { name: string } | null;
}

export async function listPendingOnboardingDocs(
  supabase: SupabaseClient,
): Promise<PendingOnboardingDoc[]> {
  const { data, error } = await supabase
    .from("onboarding_documents")
    .select("*, workers(name)")
    .eq("status", "後送")
    .is("received_on", null)
    .order("due_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as PendingOnboardingDoc[]) ?? [];
}
