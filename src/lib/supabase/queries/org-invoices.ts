import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgInvoice } from "@/types/db";

// ---- 所属機関ごとの請求・入金の記録（org_invoices） ----
// 督促状のもとになる台帳。月ごとの請求と入金を保存し、記録を積み上げていく

// 機関の請求記録を新しい月から順に一覧する
export async function listOrgInvoices(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgInvoice[]> {
  const { data, error } = await supabase
    .from("org_invoices")
    .select("*")
    .eq("organization_id", organizationId)
    .order("month", { ascending: false });
  if (error) throw error;
  return (data as OrgInvoice[]) ?? [];
}

// 今回の請求（請求書番号・実際の請求金額）を保存する。同じ機関×月なら上書き。
// paid / paid_on は指定しないため、入金の記録は保たれる
export async function upsertOrgInvoice(
  supabase: SupabaseClient,
  input: Pick<
    OrgInvoice,
    "organization_id" | "month" | "billed_on" | "invoice_no" | "amount" | "due_on"
  >,
): Promise<OrgInvoice> {
  const { data, error } = await supabase
    .from("org_invoices")
    .upsert(input, { onConflict: "organization_id,month" })
    .select()
    .single();
  if (error) throw error;
  return data as OrgInvoice;
}

// 入金の記録などの部分更新（入金済み額・入金日・メモ）
export async function updateOrgInvoice(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<OrgInvoice, "invoice_no" | "amount" | "paid" | "paid_on" | "note">>,
): Promise<void> {
  const { error } = await supabase.from("org_invoices").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOrgInvoice(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("org_invoices").delete().eq("id", id);
  if (error) throw error;
}
