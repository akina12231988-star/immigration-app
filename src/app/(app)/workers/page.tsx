import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithHistories } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listApplications } from "@/lib/supabase/queries/applications";
import { retireWorkersPastLeavingDate } from "@/lib/supabase/queries/resignations";
import { todayStr } from "@/lib/application-alerts";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { WorkersExplorer } from "./WorkersExplorer";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  // ログイン確認とデータ取得を並列に行い、ページ表示までの待ち時間を短縮する
  const supabase = await createClient();
  // 退職の記録で退職日を過ぎた人は、一覧を出す前にステータスを「退職」にそろえる
  // （閲覧のみのロールは更新できないので失敗しても無視する）
  await retireWorkersPastLeavingDate(supabase, todayStr()).catch(() => 0);
  const [me, workers, organizations, applications] = await Promise.all([
    getMyProfile(),
    listWorkersWithHistories(supabase),
    listOrganizations(supabase),
    listApplications(supabase).catch(() => []),
  ]);
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="外国人管理" backHref="/" />
      <WorkersExplorer
        workers={workers}
        organizations={organizations}
        underReviewWorkerIds={underReviewWorkerIds(applications)}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
