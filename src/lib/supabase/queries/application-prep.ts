import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrepChecklistMeta } from "@/lib/application-prep";

// TODO番号ごとの準備リスト1件分（メタ情報＋識別子）
export interface PrepChecklistRow extends PrepChecklistMeta {
  id: string;
  todo_no: string; // Notion 申請TODO番号（'' = 番号未設定の旧データ）
}

// 外国人の準備リストを全件取得（更新が新しい順）
export async function listPrepChecklists(
  supabase: SupabaseClient,
  workerId: string,
): Promise<PrepChecklistRow[]> {
  const { data, error } = await supabase
    .from("application_prep_checklists")
    .select("id, todo_no, app_type, has_kokuho, has_nenkin, target_reiwa, kenshin_items_ok")
    .eq("worker_id", workerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data as PrepChecklistRow[]) ?? []).map((r) => ({
    id: r.id,
    todo_no: r.todo_no ?? "",
    app_type: r.app_type ?? "",
    has_kokuho: r.has_kokuho ?? false,
    has_nenkin: r.has_nenkin ?? false,
    target_reiwa: r.target_reiwa ?? null,
    kenshin_items_ok: r.kenshin_items_ok ?? false,
  }));
}

// TODO番号を指定して保存（同じ番号があれば更新、無ければ新規作成）
export async function upsertPrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
  meta: PrepChecklistMeta,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert(
      { worker_id: workerId, todo_no: todoNo, ...meta },
      { onConflict: "worker_id,todo_no" },
    );
  if (error) throw error;
}

// TODO番号の準備リストを削除する
export async function deletePrepChecklist(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .delete()
    .eq("worker_id", workerId)
    .eq("todo_no", todoNo);
  if (error) throw error;
}
