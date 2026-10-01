import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listApplications } from "@/lib/supabase/queries/applications";
import { listStampFeeUnknownRows } from "@/lib/supabase/queries/stamp-fee";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { todayStr } from "@/lib/application-alerts";
import { errorMessage } from "@/lib/errors";
import { StampFeeClient } from "./StampFeeClient";

export const dynamic = "force-dynamic";

// 収入印紙代の負担（本人負担／会社負担）が未設定の申請を、所属機関別にまとめて見る画面。
// すでに入管へ出している人（審査中・在留カード受け取り待ち）は対象から外す。
export default async function StampFeePage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const today = todayStr();
  const applications = await listApplications(supabase).catch(() => []);
  // 取得に失敗しても画面は開けるようにし、失敗した事実だけ出す（0件と紛らわしくしない）
  const { rows, error } = await listStampFeeUnknownRows(supabase, underReviewWorkerIds(applications)).then(
    (r) => ({ rows: r, error: null as string | null }),
    (e: unknown) => ({ rows: [], error: errorMessage(e, "申請の取得に失敗しました") }),
  );

  return (
    <>
      <AppHeader title="収入印紙代の負担が未設定" backHref="/" />
      <StampFeeClient rows={rows} error={error} today={today} />
    </>
  );
}
