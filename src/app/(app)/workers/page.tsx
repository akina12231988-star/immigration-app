import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithHistories } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listApplications } from "@/lib/supabase/queries/applications";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
import { WorkersExplorer } from "./WorkersExplorer";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [workers, organizations, applications] = await Promise.all([
    listWorkersWithHistories(supabase),
    listOrganizations(supabase),
    listApplications(supabase).catch(() => []),
  ]);

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
