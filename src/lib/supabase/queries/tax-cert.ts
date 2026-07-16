import type { SupabaseClient } from "@supabase/supabase-js";
import type { Municipality, MunicipalityInput, JudgmentRecord } from "@/lib/tax-cert";

// ---- 自治体マスタ ----
export async function listMunicipalities(supabase: SupabaseClient): Promise<Municipality[]> {
  const { data, error } = await supabase
    .from("municipalities")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as Municipality[]) ?? [];
}

export async function insertMunicipality(
  supabase: SupabaseClient,
  input: MunicipalityInput,
): Promise<Municipality> {
  const { data, error } = await supabase.from("municipalities").insert(input).select().single();
  if (error) throw error;
  return data as Municipality;
}

export async function updateMunicipality(
  supabase: SupabaseClient,
  id: string,
  input: MunicipalityInput,
): Promise<Municipality> {
  const { data, error } = await supabase
    .from("municipalities")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Municipality;
}

export async function deleteMunicipality(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("municipalities").delete().eq("id", id);
  if (error) throw error;
}

// ---- 判定記録（本体は data jsonb）----
type RecordRow = { id: string; data: Record<string, unknown>; created_at: string };

function toRecord(row: RecordRow): JudgmentRecord {
  return { ...(row.data as object), id: row.id, createdAt: row.created_at } as JudgmentRecord;
}

export async function listJudgmentRecords(supabase: SupabaseClient): Promise<JudgmentRecord[]> {
  const { data, error } = await supabase
    .from("judgment_records")
    .select("id, data, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as RecordRow[]) ?? []).map(toRecord);
}

// id・createdAt を除いた本体を data に保存する
function toData(record: JudgmentRecord): Record<string, unknown> {
  const { id: _id, createdAt: _createdAt, ...rest } = record;
  void _id;
  void _createdAt;
  return rest;
}

export async function insertJudgmentRecord(
  supabase: SupabaseClient,
  record: JudgmentRecord,
): Promise<JudgmentRecord> {
  const { data, error } = await supabase
    .from("judgment_records")
    .insert({ data: toData(record) })
    .select("id, data, created_at")
    .single();
  if (error) throw error;
  return toRecord(data as RecordRow);
}

export async function updateJudgmentRecord(
  supabase: SupabaseClient,
  id: string,
  record: JudgmentRecord,
): Promise<void> {
  const { error } = await supabase
    .from("judgment_records")
    .update({ data: toData(record) })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteJudgmentRecord(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("judgment_records").delete().eq("id", id);
  if (error) throw error;
}
