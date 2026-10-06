import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisaHistoryManual } from "@/lib/visa-history";

// 在留資格の履歴のうち、手で入れた分（worker_visa_history・0138）

export type VisaHistoryInput = Omit<VisaHistoryManual, "id">;

export async function listVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
): Promise<VisaHistoryManual[]> {
  // hidden（0153）が未適用でも読めるよう select("*") にして、無ければ false 扱い
  const { data, error } = await supabase
    .from("worker_visa_history")
    .select("*")
    .eq("worker_id", workerId)
    .order("permit_date", { ascending: true });
  if (error) throw error;
  return ((data as (VisaHistoryManual & { hidden?: boolean | null })[]) ?? []).map((r) => ({
    id: r.id,
    permit_date: r.permit_date,
    status: r.status,
    kind: r.kind,
    expiry_date: r.expiry_date,
    card_no: r.card_no,
    note: r.note,
    hidden: r.hidden === true,
  }));
}

// 自動で出ている許可を履歴から外す（「削除」。元の申請・在留カードの記録は残る）
export async function hideVisaHistory(
  supabase: SupabaseClient,
  workerId: string,
  input: { permit_date: string; status: string },
): Promise<void> {
  const { error } = await supabase
    .from("worker_visa_history")
    .insert({ worker_id: workerId, permit_date: input.permit_date, status: input.status, hidden: true });
  if (error) throw error;
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
