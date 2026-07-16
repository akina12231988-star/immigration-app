import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrientations } from "@/lib/supabase/queries/orientations";
import { listWorkersBrief } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { OrientationsClient } from "./OrientationsClient";

export const dynamic = "force-dynamic";

export default async function OrientationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const canEdit = me.role !== "viewer";
  const [orientations, workers, organizations] = await Promise.all([
    listOrientations(supabase).catch(() => []),
    canEdit ? listWorkersBrief(supabase).catch(() => []) : Promise.resolve([]),
    canEdit ? listOrganizations(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader title="生活オリエンテーション" backHref="/" />
      <OrientationsClient
        orientations={orientations}
        workers={workers}
        organizations={organizations}
        canEdit={canEdit}
      />
    </>
  );
}
