import "server-only";
import type { createClient } from "@/lib/supabase/server";

// 郵送請求ツールで使う外国人の項目（現在の住所は請求先判断、フリガナ・個人番号は納税証明書の請求書の自動入力に使う）
export interface MailingWorkerRow {
  id: string;
  name: string;
  address: string | null;
  kana: string | null;
  my_number: string | null;
}

export async function listMailingWorkers(supabase: Awaited<ReturnType<typeof createClient>>): Promise<MailingWorkerRow[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, address, kana, my_number")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as MailingWorkerRow[]) ?? [];
}

