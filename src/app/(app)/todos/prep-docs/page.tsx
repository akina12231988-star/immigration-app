import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listApplications } from "@/lib/supabase/queries/applications";
import { listPrepMissingRows } from "@/lib/supabase/queries/prep-missing";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { todayStr } from "@/lib/application-alerts";
import { errorMessage } from "@/lib/errors";
import { PrepMissingClient } from "./PrepMissingClient";

export const dynamic = "force-dynamic";

// 申請準備でまだ揃っていない書類を、外国人をまたいでまとめて見る画面。
// すでに入管へ出している人（審査中・在留カード受け取り待ち）は対象から外す。
export default async function PrepMissingPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const today = todayStr();
  const applications = await listApplications(supabase).catch(() => []);
  // 取得に失敗しても画面は開けるようにし、失敗した事実だけ出す（0件と紛らわしくしない）
  const { rows, error } = await listPrepMissingRows(
    supabase,
    today,
    underReviewWorkerIds(applications),
  ).then(
    (r) => ({ rows: r, error: null as string | null }),
    (e: unknown) => ({ rows: [], error: errorMessage(e, "書類の取得に失敗しました") }),
  );

  return (
    <>
      <AppHeader title="まだ揃っていない書類（申請準備）" backHref="/" />
      <PrepMissingClient rows={rows} error={error} today={today} />
    </>
  );
}
