import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ssw2Instructee, Ssw2InstructeeInput } from "@/lib/ssw2-instructees";

// 「２号特定技能外国人に指導を受ける対象者一覧」（0120）の読み書き。

export async function listSsw2Instructees(
  supabase: SupabaseClient,
  workerId: string,
): Promise<Ssw2Instructee[]> {
  const { data, error } = await supabase
    .from("ssw2_instructees")
    .select("*")
    .eq("worker_id", workerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Ssw2Instructee[]) ?? [];
}

// すでに他の2号申請者の対象者になっている外国人を調べる。
// 返すのは「対象者の外国人ID → 押さえている2号申請者の氏名」。
// 様式の留意事項4（他の2号特定技能外国人に指導を受けている者は記載しない）の突き合わせに使う。
export async function fetchTakenInstructees(
  supabase: SupabaseClient,
  exceptWorkerId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("ssw2_instructees")
    .select("target_worker_id, worker_id, workers!ssw2_instructees_worker_id_fkey(name)")
    .not("target_worker_id", "is", null)
    .neq("worker_id", exceptWorkerId);
  if (error) throw error;
  const rows =
    (data as { target_worker_id: string; worker_id: string; workers?: { name?: string } | null }[] | null) ??
    [];
  return new Map(rows.map((r) => [r.target_worker_id, r.workers?.name ?? "ほかの申請者"]));
}

export async function insertSsw2Instructee(
  supabase: SupabaseClient,
  input: Ssw2InstructeeInput,
): Promise<Ssw2Instructee> {
  const { data, error } = await supabase
    .from("ssw2_instructees")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as Ssw2Instructee;
}

export async function updateSsw2Instructee(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Ssw2InstructeeInput>,
): Promise<Ssw2Instructee> {
  const { data, error } = await supabase
    .from("ssw2_instructees")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Ssw2Instructee;
}

export async function deleteSsw2Instructee(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("ssw2_instructees").delete().eq("id", id);
  if (error) throw error;
}
