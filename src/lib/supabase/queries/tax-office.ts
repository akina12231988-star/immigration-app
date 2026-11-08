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

// 同じ名前の税務署がすでにあるときのエラー（税務署名は重複できない・idx_tax_offices_name）。
// existing にすでにある税務署を入れて、画面でそれを選べるようにする
export class DuplicateTaxOfficeError extends Error {
  existing: TaxOffice | null;
  constructor(name: string, existing: TaxOffice | null) {
    super(`「${name}」はすでに税務署マスタに登録されています。一覧から選んでください（同じ名前の税務署は2つ登録できません）`);
    this.name = "DuplicateTaxOfficeError";
    this.existing = existing;
  }
}

// 名前の比べ方（前後の空白・全角半角の違いは同じ扱い）
export function taxOfficeNameKey(name: string): string {
  return name.normalize("NFKC").replace(/[\s　]/g, "");
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23505";
}

async function findTaxOfficeByName(supabase: SupabaseClient, name: string, exceptId?: string): Promise<TaxOffice | null> {
  const all = await listTaxOffices(supabase).catch(() => [] as TaxOffice[]);
  const key = taxOfficeNameKey(name);
  return all.find((o) => o.id !== exceptId && taxOfficeNameKey(o.name) === key) ?? null;
}

export async function insertTaxOffice(
  supabase: SupabaseClient,
  input: TaxOfficeInput,
): Promise<TaxOffice> {
  const name = input.name.trim();
  // 先に同じ名前の税務署が無いかを見る（あればそれを返せるようにエラーで知らせる）
  const dup = await findTaxOfficeByName(supabase, name);
  if (dup) throw new DuplicateTaxOfficeError(dup.name, dup);
  const { data, error } = await supabase.from("tax_offices").insert({ ...input, name }).select().single();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateTaxOfficeError(name, await findTaxOfficeByName(supabase, name));
    throw error;
  }
  return data as TaxOffice;
}

export async function updateTaxOffice(
  supabase: SupabaseClient,
  id: string,
  input: TaxOfficeInput,
): Promise<TaxOffice> {
  const name = input.name.trim();
  const dup = await findTaxOfficeByName(supabase, name, id);
  if (dup) throw new DuplicateTaxOfficeError(dup.name, dup);
  const { data, error } = await supabase
    .from("tax_offices")
    .update({ ...input, name })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new DuplicateTaxOfficeError(name, await findTaxOfficeByName(supabase, name, id));
    throw error;
  }
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
