import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MonthlySupportRegistration,
  SalesEntryInput,
  SalesEntryRow,
  SalesEntryStatus,
} from "@/types/db";

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

// ---- ◯月分の支援代のfreee登録記録（monthly_support_registrations） ----

// 対象の年月の登録記録を一覧する（請求書作成でボタンの状態表示に使う）
export async function listMonthlySupportRegistrations(
  supabase: SupabaseClient,
  month: string,
): Promise<MonthlySupportRegistration[]> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .select("*")
    .eq("month", month);
  if (error) throw error;
  return (data as MonthlySupportRegistration[]) ?? [];
}

// 「freee売上登録」ボタン: ◯月分の支援代（サポート代）を登録した記録を残す
export async function addMonthlySupportRegistration(
  supabase: SupabaseClient,
  input: Pick<MonthlySupportRegistration, "worker_id" | "month" | "fee_name" | "registered_on">,
): Promise<MonthlySupportRegistration> {
  const { data, error } = await supabase
    .from("monthly_support_registrations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as MonthlySupportRegistration;
}

// 登録記録の取り消し（押し間違いの訂正用）
export async function deleteMonthlySupportRegistration(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("monthly_support_registrations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
