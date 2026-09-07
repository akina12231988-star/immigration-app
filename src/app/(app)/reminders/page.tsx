import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { countReminderImages, listReminders } from "@/lib/supabase/queries/reminders";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { todayStr } from "@/lib/ssw/calc";
import { dbErrorMessage } from "@/lib/errors";
import { RemindersClient } from "./RemindersClient";

export const dynamic = "force-dynamic";

// 督促（外国人への連絡と返事の進捗）。
// 市役所からの通知・領収書などを本人に知らせ、連絡した／返事があった／完了 を追いかける。
// 番号は保管ボックスのように1〜30番を使い、完了すると空きになる。
//   ?worker=外国人ID … その人の督促に絞り、新規登録の外国人を入れた状態で開く
//   ?no=番号        … その番号の督促を開く
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ worker?: string; no?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { worker, no } = await searchParams;
  const initialNo = no ? Number.parseInt(no, 10) : undefined;

  const supabase = await createClient();
  // reminders 未作成（マイグレーション未実行）でも画面は開き、案内を出す
  const [loaded, workers, imageCounts] = await Promise.all([
    // Supabase のエラーは Error 型ではないオブジェクトなので、dbErrorMessage で文字にする
    // （テーブル未作成なら、どのマイグレーションを適用すればよいかまで案内する）
    listReminders(supabase).then(
      (rows) => ({ rows, error: null as string | null }),
      (err: unknown) => ({
        rows: [],
        error: dbErrorMessage(err, "0144_reminders.sql", "督促の読み込みに失敗しました"),
      }),
    ),
    listWorkersWithOrg(supabase).catch(() => []),
    countReminderImages(supabase).catch(() => new Map<string, number>()),
  ]);
  const reminders = loaded.rows;
  const loadError = loaded.error;

  return (
    <>
      <AppHeader title="督促（連絡・返事待ち）" backHref="/" />
      <RemindersClient
        initialReminders={reminders}
        initialImageCounts={Object.fromEntries(imageCounts)}
        workers={workers}
        canWrite={me.role !== "viewer"}
        today={todayStr()}
        initialWorkerId={worker ?? null}
        initialNo={Number.isFinite(initialNo) ? initialNo : undefined}
        loadError={loadError}
      />
    </>
  );
}
