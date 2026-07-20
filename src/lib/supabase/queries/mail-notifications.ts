import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailCategory, MailNotificationRow } from "@/types/db";

// workers / immigration_applications を埋め込んだときの行型
type RowWithRefs = MailNotificationRow & {
  workers: { id: string; name: string } | null;
  immigration_applications: { id: string; name: string; status: string } | null;
};

// 埋め込みは FK 列名でリレーションを明示する（列が2本あるため）
const SELECT =
  "*, workers:workers!matched_worker_id(id, name), immigration_applications:immigration_applications!matched_application_id(id, name, status)";

export interface MailNotification {
  id: string;
  gmailMessageId: string | null;
  category: MailCategory;
  subject: string;
  fromAddress: string;
  snippet: string;
  body: string;
  receivedAt: string;
  gmailLink: string;
  matchedWorkerId: string | null;
  matchedWorkerName: string | null;
  matchedApplicationId: string | null;
  matchedApplicationStatus: string | null;
  matchedName: string;
  isRead: boolean;
  createdAt: string;
}

function toNotification(row: RowWithRefs): MailNotification {
  return {
    id: row.id,
    gmailMessageId: row.gmail_message_id,
    category: (row.category as MailCategory) ?? "その他",
    subject: row.subject,
    fromAddress: row.from_address,
    snippet: row.snippet,
    body: row.body,
    receivedAt: row.received_at,
    gmailLink: row.gmail_link,
    matchedWorkerId: row.matched_worker_id,
    matchedWorkerName: row.workers?.name ?? null,
    matchedApplicationId: row.matched_application_id,
    matchedApplicationStatus: row.immigration_applications?.status ?? null,
    matchedName: row.matched_name,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function listMailNotifications(
  supabase: SupabaseClient,
  limit = 200,
): Promise<MailNotification[]> {
  const { data, error } = await supabase
    .from("mail_notifications")
    .select(SELECT)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as RowWithRefs[]) ?? []).map(toNotification);
}

export async function setMailNotificationRead(
  supabase: SupabaseClient,
  id: string,
  isRead: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("mail_notifications")
    .update({ is_read: isRead })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllMailNotificationsRead(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from("mail_notifications")
    .update({ is_read: true })
    .eq("is_read", false);
  if (error) throw error;
}

// 自動紐づけの手動修正（外国人・申請を付け替える。null でクリア）
export async function relinkMailNotification(
  supabase: SupabaseClient,
  id: string,
  patch: { workerId?: string | null; applicationId?: string | null; matchedName?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if ("workerId" in patch) row.matched_worker_id = patch.workerId ?? null;
  if ("applicationId" in patch) row.matched_application_id = patch.applicationId ?? null;
  if (patch.matchedName !== undefined) row.matched_name = patch.matchedName;
  const { error } = await supabase.from("mail_notifications").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteMailNotification(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("mail_notifications").delete().eq("id", id);
  if (error) throw error;
}
