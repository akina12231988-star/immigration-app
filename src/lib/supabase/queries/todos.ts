import type { SupabaseClient } from "@supabase/supabase-js";
import { nextTodoNo, type TodoKind, type TodoStatusOption } from "@/lib/todo";

// TODO（NotionのTODOデータベースの置き換え）の読み書き。
// テーブルは 0102_todos.sql（todos / todo_status_options）

export interface TodoRow {
  id: string;
  todo_no: string;
  kind: TodoKind;
  worker_id: string | null;
  worker_name?: string | null; // JOIN 表示用
  title: string;
  status: string;
  check_status: string; // 経過が「〜チェック中」のときの確認ステータス
  assen: string; // あっせんの有無（'' / あり / なし。申請準備のTODOで使う・0103）
  assen_note: string; // あっせん無しの場合の申請書類作成の経緯
  agent_name: string; // 申請取次士（申請準備のTODOで使う・0106）
  self_apply: boolean; // 本人申請でするか（0106）
  deleted_at: string | null; // 削除フォルダに入れた日時（null = 通常。30日で完全削除・0108）
  note: string;
  created_at: string;
  updated_at: string;
}

// 削除フォルダの保存期間（日）。これを過ぎたら完全に削除する
export const TODO_TRASH_DAYS = 30;

export async function listTodos(supabase: SupabaseClient): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("todos")
    .select("*, workers(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data as (TodoRow & { workers: { name: string } | null })[]) ?? [];
  // 0103/0106/0108 が未適用でも画面が壊れないよう、無い列は既定値で補う
  return rows.map((r) => ({
    ...r,
    worker_name: r.workers?.name ?? null,
    assen: r.assen ?? "",
    assen_note: r.assen_note ?? "",
    agent_name: r.agent_name ?? "",
    self_apply: r.self_apply ?? false,
    deleted_at: r.deleted_at ?? null,
  }));
}

// 次のTODO番号。todos に加え、Notion由来の番号が入っている
// 申請準備（application_prep_checklists.todo_no）と随時報告（resignations.todo_no）も見て、
// 通し番号の続きから振る
export async function fetchNextTodoNo(supabase: SupabaseClient): Promise<string> {
  const nos: string[] = [];
  const { data: t } = await supabase.from("todos").select("todo_no");
  for (const r of (t as { todo_no: string }[] | null) ?? []) nos.push(r.todo_no);
  // どちらかのテーブルが無い環境でも採番は続けられるように握りつぶす
  const { data: p } = await supabase
    .from("application_prep_checklists")
    .select("todo_no")
    .then((res) => (res.error ? { data: null } : res));
  for (const r of (p as { todo_no: string | null }[] | null) ?? []) nos.push(r.todo_no ?? "");
  const { data: g } = await supabase
    .from("resignations")
    .select("todo_no")
    .then((res) => (res.error ? { data: null } : res));
  for (const r of (g as { todo_no: string | null }[] | null) ?? []) nos.push(r.todo_no ?? "");
  return nextTodoNo(nos);
}

export interface NewTodo {
  kind: TodoKind;
  worker_id?: string | null;
  title?: string;
  status?: string;
  note?: string;
  todo_no?: string; // 指定しなければ自動採番
}

// TODOを作成して作成後の行を返す（番号未指定なら通し番号で自動採番）
export async function insertTodo(supabase: SupabaseClient, input: NewTodo): Promise<TodoRow> {
  const todoNo = (input.todo_no ?? "").trim() || (await fetchNextTodoNo(supabase));
  const { data, error } = await supabase
    .from("todos")
    .insert({
      todo_no: todoNo,
      kind: input.kind,
      worker_id: input.worker_id ?? null,
      title: input.title ?? "",
      status: input.status ?? "未着手",
      note: input.note ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TodoRow;
}

export async function updateTodo(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      TodoRow,
      | "todo_no"
      | "worker_id"
      | "title"
      | "status"
      | "check_status"
      | "assen"
      | "assen_note"
      | "agent_name"
      | "self_apply"
      | "note"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("todos")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// 申請準備などでTODO番号を変更したとき、TODO一覧側の番号もそろえる（該当が無ければ何もしない）
export async function renameTodoNo(
  supabase: SupabaseClient,
  kind: TodoKind,
  workerId: string,
  from: string,
  to: string,
): Promise<void> {
  const { error } = await supabase
    .from("todos")
    .update({ todo_no: to, updated_at: new Date().toISOString() })
    .eq("kind", kind)
    .eq("worker_id", workerId)
    .eq("todo_no", from);
  if (error) throw error;
}

// 削除 = 削除フォルダ（ごみ箱）へ移動。30日間は復元でき、その後完全に削除される（0108）
export async function deleteTodo(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("todos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// 削除フォルダから元に戻す
export async function restoreTodo(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("todos").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// 完全に削除する（削除フォルダからの手動削除）
export async function purgeTodo(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) throw error;
}

// 削除フォルダで30日を過ぎたTODOを完全に削除する（画面を開いたときに呼ぶ）。
// 0108未適用・権限なしなどで失敗しても呼び出し側で握りつぶしてよい
export async function purgeExpiredTodos(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - TODO_TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("todos").delete().lt("deleted_at", cutoff);
  if (error) throw error;
}

// ---- ステータス（経過）の選択肢。画面から随時追加・変更・削除して運用できる ----

export async function listTodoStatusOptions(
  supabase: SupabaseClient,
): Promise<TodoStatusOption[]> {
  const { data, error } = await supabase
    .from("todo_status_options")
    .select("*")
    .order("sort_no", { ascending: true });
  if (error) throw error;
  return (data as TodoStatusOption[]) ?? [];
}

export async function insertTodoStatusOption(
  supabase: SupabaseClient,
  option: Omit<TodoStatusOption, "id">,
): Promise<void> {
  const { error } = await supabase.from("todo_status_options").insert(option);
  if (error) throw error;
}

export async function renameTodoStatusOption(
  supabase: SupabaseClient,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase.from("todo_status_options").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteTodoStatusOption(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("todo_status_options").delete().eq("id", id);
  if (error) throw error;
}
