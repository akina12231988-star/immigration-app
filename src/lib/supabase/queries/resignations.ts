import type { SupabaseClient } from "@supabase/supabase-js";
import type { Organization, ResignationInput, ResignationRow, Worker } from "@/types/db";
import { shouldRetireWorker } from "@/lib/resignation-report";

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
    // 退職日が未定（null）のものを先頭に出す（「退職日を聞いて！！」の対象）
    .order("leaving_on", { ascending: false, nullsFirst: true });
  if (error) throw error;
  return (data as ResignationWithRefs[]) ?? [];
}

// 様式作成用: 届出の対象者欄に必要な外国人情報と機関情報（業務区分など）を全て取得
export interface ResignationForForms extends ResignationRow {
  workers: Worker | null;
  organizations: Organization | null;
}

export async function getResignationForForms(
  supabase: SupabaseClient,
  id: string,
): Promise<ResignationForForms | null> {
  const { data, error } = await supabase
    .from("resignations")
    .select("*, workers(*), organizations(*)")
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

// 退職日を過ぎた退職の記録について、外国人のステータスを「退職」にする。
// 退職を記録した時点では在籍中のままにしておき、退職日の翌日以降に画面を開いたときに
// ここで自動で切り替える（再雇用・転職で在籍が続いている人は shouldRetireWorker で除く）。
// 変えた外国人の数を返す。マイグレーション未適用などで失敗しても呼び出し側で握りつぶしてよい
export async function retireWorkersPastLeavingDate(
  supabase: SupabaseClient,
  today: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("resignations")
    .select(
      "id, organization_id, leaving_on, workers(id, status, leaving_on, current_organization_id, employment_start_on)",
    )
    .not("leaving_on", "is", null)
    .lt("leaving_on", today);
  if (error) throw error;
  type Row = {
    organization_id: string | null;
    leaving_on: string | null;
    workers: {
      id: string;
      status: string;
      leaving_on: string | null;
      current_organization_id: string | null;
      employment_start_on: string | null;
    } | null;
  };
  const ids = new Set<string>();
  for (const r of ((data as unknown as Row[] | null) ?? [])) {
    if (!r.workers) continue;
    if (shouldRetireWorker(r.workers, r, today)) ids.add(r.workers.id);
  }
  if (ids.size === 0) return 0;
  const { error: updErr } = await supabase
    .from("workers")
    .update({ status: "退職" })
    .in("id", [...ids]);
  if (updErr) throw updErr;
  return ids.size;
}
