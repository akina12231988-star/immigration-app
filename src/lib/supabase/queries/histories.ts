import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkHistoryInput, WorkHistoryRow } from "@/types/db";
import type { WorkHistory } from "@/types/ssw";

// DB行 → 通算計算（lib/ssw/calc.ts）の入力形式へ変換
export function toCalcHistory(row: WorkHistoryRow): WorkHistory {
  return {
    id: row.id,
    visa: row.visa,
    start: row.start_date,
    end: row.end_date,
    org: row.org_name,
    role: row.role,
    note: row.note,
    keptResidence: row.kept_residence_status,
  };
}

export async function insertHistory(
  supabase: SupabaseClient,
  input: WorkHistoryInput,
): Promise<WorkHistoryRow> {
  const { data, error } = await supabase
    .from("work_histories")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as WorkHistoryRow;
}

export async function updateHistory(
  supabase: SupabaseClient,
  id: string,
  input: Partial<WorkHistoryInput>,
): Promise<WorkHistoryRow> {
  const { data, error } = await supabase
    .from("work_histories")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as WorkHistoryRow;
}

export async function deleteHistory(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("work_histories").delete().eq("id", id);
  if (error) throw error;
}
