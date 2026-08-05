import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesEntryInput, SalesEntryRow, SalesEntryStatus } from "@/types/db";

// ---- freee販売への売上登録（sales_entries） ----

// 一覧（外国人名・在留許可日・所属機関名つき）。登録待ちの確認や許可日での絞り込みに使う
export interface SalesEntryWithRefs extends SalesEntryRow {
  workers: { name: string; residence_permit_date: string | null } | null;
  organizations: { name: string } | null;
}

export async function listSalesEntries(
  supabase: SupabaseClient,
): Promise<SalesEntryWithRefs[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*, workers(name, residence_permit_date), organizations(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SalesEntryWithRefs[]) ?? [];
}

export async function listSalesEntriesByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<SalesEntryRow[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SalesEntryRow[]) ?? [];
}

export async function insertSalesEntries(
  supabase: SupabaseClient,
  inputs: SalesEntryInput[],
): Promise<SalesEntryRow[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await supabase.from("sales_entries").insert(inputs).select();
  if (error) throw error;
  return (data as SalesEntryRow[]) ?? [];
}

export async function updateSalesEntry(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<SalesEntryInput>,
): Promise<void> {
  const { error } = await supabase.from("sales_entries").update(patch).eq("id", id);
  if (error) throw error;
}

// 登録済み・対象外への切り替え（登録済みは伝票番号と登録日も記録）
export async function setSalesEntryStatus(
  supabase: SupabaseClient,
  id: string,
  status: SalesEntryStatus,
  extra: { freee_no?: string; registered_on?: string | null } = {},
): Promise<void> {
  await updateSalesEntry(supabase, id, {
    status,
    ...(extra.freee_no !== undefined ? { freee_no: extra.freee_no } : {}),
    ...(extra.registered_on !== undefined ? { registered_on: extra.registered_on } : {}),
  });
}

export async function deleteSalesEntry(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("sales_entries").delete().eq("id", id);
  if (error) throw error;
}
