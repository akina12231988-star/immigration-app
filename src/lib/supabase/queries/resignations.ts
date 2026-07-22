import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResignationInput, ResignationRow, Worker } from "@/types/db";

// 一覧用: 外国人の氏名・リンク類と機関名を同時取得
export interface ResignationWithRefs extends ResignationRow {
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

export async function listResignations(
  supabase: SupabaseClient,
): Promise<ResignationWithRefs[]> {
  const { data, error } = await supabase
    .from("resignations")
    .select(SELECT)
    .order("leaving_on", { ascending: false });
  if (error) throw error;
  return (data as ResignationWithRefs[]) ?? [];
}

// 様式作成用: 届出の対象者欄に必要な外国人情報を全て取得
export interface ResignationForForms extends ResignationRow {
  workers: Worker | null;
}

export async function getResignationForForms(
  supabase: SupabaseClient,
  id: string,
): Promise<ResignationForForms | null> {
  const { data, error } = await supabase
    .from("resignations")
    .select("*, workers(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ResignationForForms | null;
}

export async function insertResignation(
  supabase: SupabaseClient,
  input: ResignationInput,
): Promise<ResignationRow> {
  const { data, error } = await supabase
    .from("resignations")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ResignationRow;
}

export async function updateResignation(
  supabase: SupabaseClient,
  id: string,
  input: Partial<ResignationInput>,
): Promise<ResignationRow> {
  const { data, error } = await supabase
    .from("resignations")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ResignationRow;
}

export async function deleteResignation(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("resignations").delete().eq("id", id);
  if (error) throw error;
}
