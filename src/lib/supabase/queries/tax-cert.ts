import type { SupabaseClient } from "@supabase/supabase-js";
import type { Municipality, MunicipalityInput, JudgmentRecord } from "@/lib/tax-cert";
import { guessPrefecture } from "@/lib/prefectures";

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
      prefecture: str(m.prefecture) || guessPrefecture(name),
      website_url: str(m.website_url ?? m.websiteUrl),
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

// 外国人詳細に出す、その人の郵送請求の記録（新しい順）。
// 外国人に紐づけた記録（data.workerId）に加え、紐づけ前の古い記録は氏名が同じものも拾う
export async function listJudgmentRecordsForWorker(
  supabase: SupabaseClient,
  workerId: string,
  workerName: string,
): Promise<JudgmentRecord[]> {
  const byId = supabase
    .from("judgment_records")
    .select("id, data, created_at")
    .eq("data->>workerId", workerId);
  const name = workerName.trim();
  const byName = name
    ? supabase
        .from("judgment_records")
        .select("id, data, created_at")
        .eq("data->>personName", name)
        .is("data->>workerId", null)
    : null;
  const [a, b] = await Promise.all([byId, byName ?? Promise.resolve({ data: [], error: null })]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const seen = new Set<string>();
  const rows = [...((a.data as RecordRow[]) ?? []), ...((b.data as RecordRow[]) ?? [])].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return rows.map(toRecord).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}
