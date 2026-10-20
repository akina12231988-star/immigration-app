import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeItems,
  type DocumentRequestCheck,
  type DocumentRequestCheckInput,
  type OrganizationDocumentRequest,
  type OrganizationDocumentRequestInput,
} from "@/lib/org-document-requests";

// ---- 所属機関からの書類の依頼（organization_document_requests・0183） ----

function toRequest(row: Record<string, unknown>): OrganizationDocumentRequest {
  return { ...(row as unknown as OrganizationDocumentRequest), items: normalizeItems(row.items) };
}

// 全機関の依頼（新しい順）
export async function listDocumentRequests(supabase: SupabaseClient): Promise<OrganizationDocumentRequest[]> {
  const { data, error } = await supabase
    .from("organization_document_requests")
    .select("*")
    .order("requested_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(toRequest);
}

export async function getDocumentRequest(
  supabase: SupabaseClient,
  id: string,
): Promise<OrganizationDocumentRequest | null> {
  const { data, error } = await supabase.from("organization_document_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toRequest(data as Record<string, unknown>) : null;
}

export async function insertDocumentRequest(
  supabase: SupabaseClient,
  input: OrganizationDocumentRequestInput,
): Promise<OrganizationDocumentRequest> {
  const { data, error } = await supabase.from("organization_document_requests").insert(input).select().single();
  if (error) throw error;
  return toRequest(data as Record<string, unknown>);
}

export async function updateDocumentRequest(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<OrganizationDocumentRequestInput>,
): Promise<OrganizationDocumentRequest> {
  const { data, error } = await supabase
    .from("organization_document_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toRequest(data as Record<string, unknown>);
}

export async function deleteDocumentRequest(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("organization_document_requests").delete().eq("id", id);
  if (error) throw error;
}

// ---- 外国人 × 項目のチェック ----

export async function listDocumentRequestChecks(
  supabase: SupabaseClient,
  requestId: string,
): Promise<DocumentRequestCheck[]> {
  const { data, error } = await supabase
    .from("organization_document_request_checks")
    .select("*")
    .eq("request_id", requestId);
  if (error) throw error;
  return (data as DocumentRequestCheck[]) ?? [];
}

// 全依頼ぶんのチェック（一覧の進み具合用）
export async function listAllDocumentRequestChecks(supabase: SupabaseClient): Promise<DocumentRequestCheck[]> {
  const { data, error } = await supabase.from("organization_document_request_checks").select("*");
  if (error) throw error;
  return (data as DocumentRequestCheck[]) ?? [];
}

// 外国人 × 項目で1行。あれば更新、無ければ追加
export async function upsertDocumentRequestCheck(
  supabase: SupabaseClient,
  input: DocumentRequestCheckInput,
): Promise<DocumentRequestCheck> {
  const { data, error } = await supabase
    .from("organization_document_request_checks")
    .upsert(input, { onConflict: "request_id,worker_id,item_id" })
    .select()
    .single();
  if (error) throw error;
  return data as DocumentRequestCheck;
}

// まとめて保存（全員に案内済を付ける など）
export async function upsertDocumentRequestChecks(
  supabase: SupabaseClient,
  inputs: DocumentRequestCheckInput[],
): Promise<DocumentRequestCheck[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase
    .from("organization_document_request_checks")
    .upsert(inputs, { onConflict: "request_id,worker_id,item_id" })
    .select();
  if (error) throw error;
  return (data as DocumentRequestCheck[]) ?? [];
}
