import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailTableOverride, TableMail } from "@/lib/immigration-mail-table";
import type { MailCategory, MailNotificationRow } from "@/types/db";
import { classifyMailCategory } from "@/lib/mail-classify";

// workers / immigration_applications を埋め込んだときの行型
type RowWithRefs = Omit<MailNotificationRow, "body" | "updated_at"> & {
  workers: { id: string; name: string } | null;
  immigration_applications: { id: string; name: string; status: string } | null;
};

// 一覧に出す列だけを取る。
// 本文（body）はメール1通ぶんの全文が入っていて重く、画面では使っていないので取らない
// （1分ごとに全ページから読み直すため、* にすると読み込み量が跳ね上がる）。
const COLUMNS = [
  "id",
  "gmail_message_id",
  "category",
  "subject",
  "from_address",
  "snippet",
  "received_at",
  "gmail_link",
  "matched_worker_id",
  "matched_application_id",
  "matched_name",
  "is_read",
  "created_at",
].join(", ");

// 埋め込みは FK 列名でリレーションを明示する（列が2本あるため）
const SELECT = `${COLUMNS}, workers:workers!matched_worker_id(id, name), immigration_applications:immigration_applications!matched_application_id(id, name, status)`;

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
    // 前に「許可」と分類して取り込んだオンライン申請の受付メールも、件名から申請受付に直して出す
    category:
      classifyMailCategory(row.subject ?? "", "") === "申請受付" ? "申請受付" : ((row.category as MailCategory) ?? "その他"),
    subject: row.subject,
    fromAddress: row.from_address,
    snippet: row.snippet,
    body: "", // 本文は取っていない（重いため。画面でも使っていない）
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
  return ((data as unknown as RowWithRefs[]) ?? []).map(toNotification);
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

// 入管メールを受け取っている Gmail のアカウント（「Gmailで開く」をそのアカウントで開くため。app_settings の immigration_mail）
export const IMMIGRATION_MAIL_SETTING_KEY = "immigration_mail";
export interface ImmigrationMailSetting extends Record<string, unknown> {
  gmailAccount: string;
}

// ---- 申請ごとの一覧表（入管メール → 申請1件＝1行）----

// 表を組み立てるためのメール（本文つき。新しいもの から limit 件）
export async function listMailsForTable(supabase: SupabaseClient, limit = 1500): Promise<TableMail[]> {
  const { data, error } = await supabase
    .from("mail_notifications")
    .select("id, subject, body, received_at, gmail_link, is_read, matched_application_id, matched_worker_id")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (
    (data as {
      id: string;
      subject: string | null;
      body: string | null;
      received_at: string;
      gmail_link: string | null;
      is_read: boolean;
      matched_application_id: string | null;
      matched_worker_id: string | null;
    }[] | null) ?? []
  ).map((r) => ({
    id: r.id,
    subject: r.subject ?? "",
    body: r.body ?? "",
    receivedAt: r.received_at,
    gmailLink: r.gmail_link ?? "",
    isRead: r.is_read,
    matchedApplicationId: r.matched_application_id,
    matchedWorkerId: r.matched_worker_id,
  }));
}

// 手で直した状態・メモ（0222）
export async function listMailTableOverrides(supabase: SupabaseClient): Promise<MailTableOverride[]> {
  const { data, error } = await supabase.from("mail_table_overrides").select("key, status, memo, updated_at");
  if (error) throw error;
  return ((data as { key: string; status: string; memo: string; updated_at: string }[] | null) ?? []).map((r) => ({
    key: r.key,
    status: r.status ?? "",
    memo: r.memo ?? "",
    updatedAt: r.updated_at,
  }));
}

export async function saveMailTableOverride(
  supabase: SupabaseClient,
  input: { key: string; status: string; memo: string },
): Promise<MailTableOverride> {
  const { data, error } = await supabase
    .from("mail_table_overrides")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("key, status, memo, updated_at")
    .single();
  if (error) throw error;
  const r = data as { key: string; status: string; memo: string; updated_at: string };
  return { key: r.key, status: r.status, memo: r.memo, updatedAt: r.updated_at };
}
