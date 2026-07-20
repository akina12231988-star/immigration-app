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

// 特定の外国人（workers.id）に紐づく判定記録のみを新しい順で取得する。
// 過去にどこへ郵送請求したかを外国人詳細から辿るために使用する。
export async function listJudgmentRecordsByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<JudgmentRecord[]> {
  const { data, error } = await supabase
    .from("judgment_records")
    .select("id, data, created_at")
    .eq("data->>workerId", workerId)
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

// ---- 旧ツール（window.storage）から書き出したデータの取り込み ----
type RawMuni = Record<string, unknown>;
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
const str = (v: unknown, dflt = "") => (typeof v === "string" && v ? v : dflt);

export async function importMailingData(
  supabase: SupabaseClient,
  payload: { municipalities?: RawMuni[]; judgment_records?: Record<string, unknown>[] },
): Promise<{ muniCount: number; recCount: number }> {
  let muniCount = 0;
  let recCount = 0;

  for (const m of payload.municipalities ?? []) {
    const name = str(m.name);
    if (!name) continue;
    const row = {
      name,
      cert_name: str(m.cert_name ?? m.certName, "課税証明書"),
      has_income: bool(m.has_income ?? m.hasIncome, true),
      has_tax: bool(m.has_tax ?? m.hasTax, true),
      needs_tax_payment_cert: bool(m.needs_tax_payment_cert ?? m.needsTaxPaymentCert, false),
      show_asterisk: bool(m.show_asterisk ?? m.showAsterisk, false),
      note: str(m.note),
    };
    const { error } = await supabase.from("municipalities").insert(row);
    if (error) throw error;
    muniCount += 1;
  }

  for (const r of payload.judgment_records ?? []) {
    const created_at = str(r.createdAt ?? r.created_at, new Date().toISOString());
    const { error } = await supabase.from("judgment_records").insert({ data: r, created_at });
    if (error) throw error;
    recCount += 1;
  }

  return { muniCount, recCount };
}
