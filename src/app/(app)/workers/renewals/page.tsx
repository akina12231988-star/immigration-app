import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { listApplications } from "@/lib/supabase/queries/applications";
import type { ApplicationStatus } from "@/types/application";
import { RenewalsClient } from "./RenewalsClient";

export const dynamic = "force-dynamic";

// 申請済〜通知書到着＝現在審査中（申請中）。この間の外国人は在留更新対象から除外する。
const UNDER_REVIEW: ApplicationStatus[] = ["申請済", "LINE報告済", "通知書到着"];

export default async function RenewalsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [workers, applications] = await Promise.all([
    listWorkersWithOrg(supabase).catch(() => []),
    listApplications(supabase).catch(() => []),
  ]);

  const underReviewWorkerIds = [
    ...new Set(
      applications
        .filter((a) => a.workerId && UNDER_REVIEW.includes(a.status))
        .map((a) => a.workerId as string),
    ),
  ];

  return (
    <>
      <AppHeader title="在留更新対象" backHref="/" />
      <RenewalsClient
        workers={workers}
        underReviewWorkerIds={underReviewWorkerIds}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
