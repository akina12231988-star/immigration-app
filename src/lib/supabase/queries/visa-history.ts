import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisaHistoryManual } from "@/lib/visa-history";

// 在留資格の履歴のうち、手で入れた分（worker_visa_history・0138）

export type VisaHistoryInput = Omit<VisaHistoryManual, "id">;

export async function listVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
): Promise<VisaHistoryManual[]> {
  const { data, error } = await supabase
    .from("worker_visa_history")
    .select("id, permit_date, status, kind, expiry_date, card_no, note")
    .eq("worker_id", workerId)
    .order("permit_date", { ascending: true });
  if (error) throw error;
  return (data as VisaHistoryManual[]) ?? [];
}

export async function insertVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
  input: VisaHistoryInput,
): Promise<void> {
  const { error } = await supabase
    .from("worker_visa_history")
    .insert({ worker_id: workerId, ...input });
  if (error) throw error;
}

export async function updateVisaHistory(
  supabase: SupabaseClient,
  id: string,
  input: VisaHistoryInput,
): Promise<void> {
  const { error } = await supabase.from("worker_visa_history").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteVisaHistory(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("worker_visa_history").delete().eq("id", id);
  if (error) throw error;
}
