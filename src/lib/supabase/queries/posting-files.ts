import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostingFileRow } from "@/types/db";

// 求人の添付ファイル（記載してもらった求人票のPDFなど）を新しい順に取得
export async function listPostingFiles(
  supabase: SupabaseClient,
  postingId: string,
): Promise<PostingFileRow[]> {
  const { data, error } = await supabase
    .from("posting_files")
    .select("*")
    .eq("posting_id", postingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as PostingFileRow[]) ?? [];
}
