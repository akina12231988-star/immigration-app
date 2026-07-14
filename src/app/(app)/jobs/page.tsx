import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listAllApplications } from "@/lib/supabase/queries/jobs";
import { JobsExplorer } from "./JobsExplorer";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const applications = await listAllApplications(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="求職一覧" backHref="/" />
      <JobsExplorer applications={applications} canEdit={me.role !== "viewer"} />
    </>
  );
}
