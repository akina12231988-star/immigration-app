import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ssw2Instructee, Ssw2InstructeeInput } from "@/lib/ssw2-instructees";
import { SSW2_APP_CONTENT } from "@/lib/application-prep";

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

// 所属機関の画面で使う一覧。
// 「誰（2号申請者）が、誰を指導対象にしているか」を全件まとめて取る。
export interface Ssw2InstructionLink {
  applicantId: string; // 2号を申請する人
  applicantName: string;
  targetWorkerId: string | null; // 対象者がアプリに登録のある外国人のとき
  targetName: string; // 対象者の氏名（手入力もある）
  office: string;
}

export async function listSsw2InstructionLinks(
  supabase: SupabaseClient,
): Promise<Ssw2InstructionLink[]> {
  const { data, error } = await supabase
    .from("ssw2_instructees")
    .select(
      "worker_id, target_worker_id, name, office, workers!ssw2_instructees_worker_id_fkey(name)",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const rows =
    (data as
      | {
          worker_id: string;
          target_worker_id: string | null;
          name: string;
          office: string;
          workers?: { name?: string } | null;
        }[]
      | null) ?? [];
  return rows.map((r) => ({
    applicantId: r.worker_id,
    applicantName: r.workers?.name ?? "（不明）",
    targetWorkerId: r.target_worker_id,
    targetName: r.name,
    office: r.office,
  }));
}

// 申請準備の申請種別（app_content）が「特定技能2号申請準備中」のリストがある外国人のID。
// 申請準備と所属機関の画面で、2号申請者の判定をそろえるのに使う（isSsw2Applicant）。
// 0121（app_content 列）が未適用などで読めないときは空で続ける（只今の状況だけで判定する）
export async function fetchSsw2PrepWorkerIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("worker_id")
    .eq("app_content", SSW2_APP_CONTENT);
  if (error) return new Set();
  return new Set(((data as { worker_id: string }[] | null) ?? []).map((r) => r.worker_id));
}
