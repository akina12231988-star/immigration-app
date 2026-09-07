import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reminder, ReminderImage, ReminderInput } from "@/types/db";

// ---- 督促（外国人への連絡と返事の進捗。0144_reminders.sql） ----

// 一覧用: 督促＋外国人の氏名など
export interface ReminderWithWorker extends Reminder {
  workers: {
    id: string;
    name: string;
    kana: string;
    messenger_link: string;
    organizations: { name: string } | null;
  } | null;
}

const SELECT = "*, workers(id, name, kana, messenger_link, organizations(name))";

export async function listReminders(supabase: SupabaseClient): Promise<ReminderWithWorker[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select(SELECT)
    .order("reminder_no", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as ReminderWithWorker[]) ?? [];
}

// 外国人詳細のアラート用: その人の進行中（完了以外）の督促
export async function listOpenRemindersByWorker(
  supabase: SupabaseClient,
  workerId: string,
): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("worker_id", workerId)
    .neq("status", "完了")
    .order("reminder_no", { ascending: true });
  if (error) throw error;
  return (data as Reminder[]) ?? [];
}

// いま使っている番号（完了以外）
export async function listActiveReminderNos(supabase: SupabaseClient): Promise<number[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("reminder_no")
    .neq("status", "完了");
  if (error) throw error;
  return ((data as { reminder_no: number }[]) ?? []).map((r) => r.reminder_no);
}

export async function insertReminder(
  supabase: SupabaseClient,
  input: ReminderInput,
): Promise<ReminderWithWorker> {
  const { data, error } = await supabase.from("reminders").insert(input).select(SELECT).single();
  if (error) throw error;
  return data as unknown as ReminderWithWorker;
}

export async function updateReminder(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ReminderInput>,
): Promise<void> {
  const { error } = await supabase.from("reminders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteReminder(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw error;
}

// 会話のスクショ（画像）の一覧（ファイルの実体は署名付きURLで別に取る）
export async function listReminderImages(
  supabase: SupabaseClient,
  reminderId: string,
): Promise<ReminderImage[]> {
  const { data, error } = await supabase
    .from("reminder_images")
    .select("*")
    .eq("reminder_id", reminderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ReminderImage[]) ?? [];
}

// 一覧で「画像が何枚あるか」を出すための件数（督促ID → 枚数）
export async function countReminderImages(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("reminder_images").select("reminder_id");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const r of (data as { reminder_id: string }[]) ?? []) {
    map.set(r.reminder_id, (map.get(r.reminder_id) ?? 0) + 1);
  }
  return map;
}

export async function updateReminderImageCaption(
  supabase: SupabaseClient,
  id: string,
  caption: string,
): Promise<void> {
  const { error } = await supabase.from("reminder_images").update({ caption }).eq("id", id);
  if (error) throw error;
}
