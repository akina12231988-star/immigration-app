import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization, SupportEndInput, SupportEndRow, Worker } from "@/types/db";

// 支援委託終了の随時報告書（参考様式第3-3-2号。0135）

// 一覧用: 外国人の氏名・リンク類と機関名を同時取得
export interface SupportEndWithRefs extends SupportEndRow {
  workers: {
    id: string;
    name: string;
    kana: string;
    messenger_link: string;
    notion_link: string;
  } | null;
  organizations: { id: string; name: string } | null;
}

const SELECT =
  "*, workers(id, name, kana, messenger_link, notion_link), organizations(id, name)";

export async function listSupportEnds(
  supabase: SupabaseClient,
): Promise<SupportEndWithRefs[]> {
  const { data, error } = await supabase
    .from("support_end_records")
    .select(SELECT)
    .order("ended_on", { ascending: false });
  if (error) throw error;
  return (data as SupportEndWithRefs[]) ?? [];
}

// 届出書の作成用: 様式の①欄に必要な外国人情報と、③欄の機関情報を全て取得
export interface SupportEndForForms extends SupportEndRow {
  workers: Worker | null;
  organizations: Organization | null;
}

export async function getSupportEndForForms(
  supabase: SupabaseClient,
  id: string,
): Promise<SupportEndForForms | null> {
  const { data, error } = await supabase
    .from("support_end_records")
    .select("*, workers(*), organizations(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as SupportEndForForms | null;
}

export async function insertSupportEnd(
  supabase: SupabaseClient,
  input: SupportEndInput,
): Promise<SupportEndRow> {
  const { data, error } = await supabase
    .from("support_end_records")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as SupportEndRow;
}

// 記録の書き換え（内容の編集だけでなく、進み具合・投函日・追跡番号の更新にも使う）
export type SupportEndPatch = Partial<
  Omit<SupportEndRow, "id" | "created_by" | "created_at" | "updated_at">
>;

export async function updateSupportEnd(
  supabase: SupabaseClient,
  id: string,
  input: SupportEndPatch,
): Promise<SupportEndRow> {
  const { data, error } = await supabase
    .from("support_end_records")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SupportEndRow;
}

export async function deleteSupportEnd(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("support_end_records").delete().eq("id", id);
  if (error) throw error;
}
