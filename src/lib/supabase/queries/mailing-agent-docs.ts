import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailingAgentDocument } from "@/lib/mailing-agent-docs";

// 郵送請求の代理人の身分証明書（mailing_agent_documents・0186）。全員ぶんをまとめて読む
export async function listMailingAgentDocuments(supabase: SupabaseClient): Promise<MailingAgentDocument[]> {
  const { data, error } = await supabase
    .from("mailing_agent_documents")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as MailingAgentDocument[]) ?? [];
}
