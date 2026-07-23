import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { listApplications } from "@/lib/supabase/queries/applications";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { RenewalsClient } from "./RenewalsClient";

export const dynamic = "force-dynamic";

export default async function RenewalsPage() {
  // ログイン確認とデータ取得を並列に行い、ページ表示までの待ち時間を短縮する
  const supabase = await createClient();
  const [me, workers, applications] = await Promise.all([
    getMyProfile(),
    listWorkersWithOrg(supabase).catch(() => []),
    listApplications(supabase).catch(() => []),
  ]);
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="申請準備" backHref="/" />
      <RenewalsClient
        workers={workers}
        underReviewWorkerIds={underReviewWorkerIds(applications)}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
