import type { SupabaseClient } from "@supabase/supabase-js";
import type { SealInput, SealRow } from "@/lib/seals";

// 印鑑BOX（seals・0162）

export interface SealWithWorker extends SealRow {
  workers: { id: string; name: string } | null; // 譲渡した外国人
}

export async function listSeals(supabase: SupabaseClient): Promise<SealWithWorker[]> {
  const { data, error } = await supabase
    .from("seals")
    .select("*, workers(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as SealWithWorker[]) ?? [];
}

// 箱の中の印鑑だけ（外国人詳細の「印鑑あり」の判定用）
export async function listSealsInBox(supabase: SupabaseClient): Promise<SealRow[]> {
  const { data, error } = await supabase.from("seals").select("*").is("transferred_on", null);
  if (error) throw error;
  return (data as SealRow[]) ?? [];
}

export async function insertSeal(supabase: SupabaseClient, input: SealInput): Promise<SealRow> {
  const { data, error } = await supabase.from("seals").insert(input).select().single();
  if (error) throw error;
  return data as SealRow;
}

export async function updateSeal(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<SealRow, "kana" | "note" | "made_on" | "transferred_on" | "transferred_to">>,
): Promise<void> {
  const { error } = await supabase.from("seals").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSeal(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("seals").delete().eq("id", id);
  if (error) throw error;
}
