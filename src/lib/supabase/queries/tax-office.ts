import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaxOffice, TaxOfficeInput } from "@/lib/tax-office";
import type { JudgmentRecord } from "@/lib/tax-cert";

// ---- 税務署マスタ（0148_tax_offices.sql）----
export async function listTaxOffices(supabase: SupabaseClient): Promise<TaxOffice[]> {
  const { data, error } = await supabase
    .from("tax_offices")
    .select("*")
    .order("prefecture", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as TaxOffice[]) ?? [];
}

export async function getTaxOffice(supabase: SupabaseClient, id: string): Promise<TaxOffice | null> {
  const { data, error } = await supabase.from("tax_offices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as TaxOffice | null) ?? null;
}

export async function insertTaxOffice(
  supabase: SupabaseClient,
  input: TaxOfficeInput,
): Promise<TaxOffice> {
  const { data, error } = await supabase.from("tax_offices").insert(input).select().single();
  if (error) throw error;
  return data as TaxOffice;
}

export async function updateTaxOffice(
  supabase: SupabaseClient,
  id: string,
  input: TaxOfficeInput,
): Promise<TaxOffice> {
  const { data, error } = await supabase
    .from("tax_offices")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as TaxOffice;
}

export async function deleteTaxOffice(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("tax_offices").delete().eq("id", id);
  if (error) throw error;
}

// ---- 外国人ごとの郵送請求の記録（申請準備に出す）----
// judgment_records.data の workerId で絞る（新しい順）
export async function listJudgmentRecordsByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<JudgmentRecord[]> {
  const { data, error } = await supabase
    .from("judgment_records")
    .select("id, data, created_at")
    .contains("data", { workerId })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as { id: string; data: Record<string, unknown>; created_at: string }[]) ?? []).map(
    (row) => ({ ...(row.data as object), id: row.id, createdAt: row.created_at }) as JudgmentRecord,
  );
}
