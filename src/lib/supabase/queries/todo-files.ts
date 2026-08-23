import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodoFileRow } from "@/types/db";

// TODOの添付ファイル（発行されたアプリケーションNo.のPDF・画像など）を新しい順に取得
export async function listTodoFiles(
  supabase: SupabaseClient,
  todoId: string,
): Promise<TodoFileRow[]> {
  const { data, error } = await supabase
    .from("todo_files")
    .select("*")
    .eq("todo_id", todoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as TodoFileRow[]) ?? [];
}
