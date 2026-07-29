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
    .select(
      "id, todo_no, app_type, has_kokuho, has_nenkin, target_reiwa, kenshin_items_ok, tantou, cert_pattern",
    )
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
    tantou: r.tantou ?? "",
    cert_pattern: r.cert_pattern ?? "",
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

// 担当者だけを保存する（そのTODO番号のリストが無ければ作成する）。
// 申請一覧「申請前＜準備中＞」からのインライン編集用。他のメタ情報は変更しない
export async function upsertPrepTantou(
  supabase: SupabaseClient,
  workerId: string,
  todoNo: string,
  tantou: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_prep_checklists")
    .upsert(
      { worker_id: workerId, todo_no: todoNo, tantou },
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

// ---- 書類ごとの準備状況（prep_doc_statuses） ----

export interface PrepDocStatusRow {
  id: string;
  checklist_id: string;
  doc_id: string;
  status: string; // 選択した準備状況（'' = 未選択）
  note: string; // 依頼先・理由書・メモ
  amount: string; // 金額（未納額など）
  date_on: string | null; // 受診日など
  tracking_out: string; // レターパック追跡番号（送付）
  tracking_back: string; // レターパック追跡番号（返信用）
  mail_after_apply: boolean; // 申請後に発行され次第、入管へ郵送する
  attach_items: string; // 添付する資料項目（カンマ区切り。年金記録: 年金記録/免除申請書）
}

export type PrepDocStatusInput = Omit<PrepDocStatusRow, "id" | "checklist_id" | "doc_id">;

export const EMPTY_PREP_DOC_STATUS: PrepDocStatusInput = {
  status: "",
  note: "",
  amount: "",
  date_on: null,
  tracking_out: "",
  tracking_back: "",
  mail_after_apply: false,
  attach_items: "",
};

// チェックリスト1件分の書類ステータスを全件取得
export async function listPrepDocStatuses(
  supabase: SupabaseClient,
  checklistId: string,
): Promise<PrepDocStatusRow[]> {
  const { data, error } = await supabase
    .from("prep_doc_statuses")
    .select("*")
    .eq("checklist_id", checklistId);
  if (error) throw error;
  return (data as PrepDocStatusRow[]) ?? [];
}

// 書類1件分のステータスを保存（無ければ作成）
export async function upsertPrepDocStatus(
  supabase: SupabaseClient,
  checklistId: string,
  docId: string,
  input: PrepDocStatusInput,
): Promise<void> {
  const { error } = await supabase
    .from("prep_doc_statuses")
    .upsert(
      { checklist_id: checklistId, doc_id: docId, ...input },
      { onConflict: "checklist_id,doc_id" },
    );
  if (error) throw error;
}

// 申請後に入管へ郵送する書類（mail_after_apply）を外国人単位で取得。
// 申請詳細でのアラート表示用（TODO番号つき）
export interface MailAfterApplyDoc {
  doc_id: string;
  todo_no: string;
}

export async function listMailAfterApplyDocs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<MailAfterApplyDoc[]> {
  const { data: lists, error: listErr } = await supabase
    .from("application_prep_checklists")
    .select("id, todo_no")
    .eq("worker_id", workerId);
  if (listErr) throw listErr;
  const checklists = (lists as { id: string; todo_no: string | null }[]) ?? [];
  if (checklists.length === 0) return [];

  const { data, error } = await supabase
    .from("prep_doc_statuses")
    .select("doc_id, checklist_id")
    .in("checklist_id", checklists.map((c) => c.id))
    .eq("mail_after_apply", true);
  if (error) throw error;
  const todoById = new Map(checklists.map((c) => [c.id, c.todo_no ?? ""]));
  return ((data as { doc_id: string; checklist_id: string }[]) ?? []).map((r) => ({
    doc_id: r.doc_id,
    todo_no: todoById.get(r.checklist_id) ?? "",
  }));
}
