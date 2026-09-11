import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listReminders } from "@/lib/supabase/queries/reminders";
import { filterReminders, isPaymentReminder, parseReminderFilter } from "@/lib/reminders";
import { todayStr } from "@/lib/ssw/calc";
import { ReminderListPrintView } from "./ReminderListPrintView";

export const dynamic = "force-dynamic";

// 督促の一覧表（支払いのある督促）をA4横で印刷するページ。
// 督促の「一覧表」の「印刷（A4横）」から、今の絞り込み・検索をそのまま渡して開く
//   ?filter=進行中|返事待ち|立替未返金|完了|すべて  ?q=検索  ?worker=外国人ID
export default async function RemindersPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; worker?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const params = await searchParams;
  const filter = parseReminderFilter(params.filter);
  const q = params.q ?? "";
  const onlyWorkerId = params.worker || null;

  const supabase = await createClient();
  const all = await listReminders(supabase).catch(() => []);
  const rows = filterReminders(all, { filter, q, onlyWorkerId }).filter((r) => isPaymentReminder(r));

  return <ReminderListPrintView rows={rows} filter={filter} q={q} today={todayStr()} />;
}
