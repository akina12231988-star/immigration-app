import type { SupabaseClient } from "@supabase/supabase-js";

// 郵送請求の記録に添付したファイル（転出届・住民票の画像など）
export interface MailingFileRow {
  id: string;
  record_id: string;
  kind: string; // 転出届 / 住民票 など
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

export async function listMailingFiles(
  supabase: SupabaseClient,
  recordId: string,
): Promise<MailingFileRow[]> {
  const { data, error } = await supabase
    .from("mailing_files")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as MailingFileRow[]) ?? [];
}
