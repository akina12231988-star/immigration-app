import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listApplications } from "@/lib/supabase/queries/applications";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { RenewalPrepClient } from "./RenewalPrepClient";

export const dynamic = "force-dynamic";

// 更新準備: 在留期限が4か月以内になった人を一覧で確認する画面
export default async function RenewalPrepPage() {
  // ログイン確認とデータ取得を並列に行い、ページ表示までの待ち時間を短縮する
  const supabase = await createClient();
  const [me, workers, applications, organizations] = await Promise.all([
    getMyProfile(),
    listWorkersWithOrg(supabase).catch(() => []),
    listApplications(supabase).catch(() => []),
    listOrganizations(supabase).catch(() => []),
  ]);
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="更新準備" backHref="/" />
      <RenewalPrepClient
        workers={workers}
        organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        underReviewWorkerIds={underReviewWorkerIds(applications)}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
