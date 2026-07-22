import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listResignations } from "@/lib/supabase/queries/resignations";
import { listWorkersForResignation } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { ResignationsClient } from "./ResignationsClient";

export const dynamic = "force-dynamic";

export default async function ResignationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const canEdit = me.role !== "viewer";
  const [resignations, workers, organizations] = await Promise.all([
    listResignations(supabase).catch(() => []),
    canEdit ? listWorkersForResignation(supabase).catch(() => []) : Promise.resolve([]),
    canEdit ? listOrganizations(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader title="退職＜随時報告＞" backHref="/" />
      <ResignationsClient
        resignations={resignations}
        workers={workers}
        organizations={organizations}
        canEdit={canEdit}
        canDelete={me.role === "admin"}
      />
    </>
  );
}
