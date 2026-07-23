import type { SupabaseClient } from "@supabase/supabase-js";

export interface PensionRecordRow {
  symbols: string; // 記号コードのカンマ区切り
  note: string;
}

const EMPTY: PensionRecordRow = { symbols: "", note: "" };

export async function getPensionRecord(
  supabase: SupabaseClient,
  workerId: string,
): Promise<PensionRecordRow> {
  const { data, error } = await supabase
    .from("pension_records")
    .select("symbols, note")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...EMPTY };
  const row = data as PensionRecordRow;
  return { symbols: row.symbols ?? "", note: row.note ?? "" };
}

export async function upsertPensionRecord(
  supabase: SupabaseClient,
  workerId: string,
  record: PensionRecordRow,
): Promise<void> {
  const { error } = await supabase
    .from("pension_records")
    .upsert({ worker_id: workerId, ...record }, { onConflict: "worker_id" });
  if (error) throw error;
}
