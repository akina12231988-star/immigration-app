import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listContractChanges } from "@/lib/supabase/queries/contract-changes";
import { listWorkersForResignation } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { AdhocReportTabs } from "../AdhocReportTabs";
import { ContractChangesClient } from "./ContractChangesClient";

export const dynamic = "force-dynamic";

export default async function ContractChangesPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const canEdit = me.role !== "viewer";
  const [changes, workers, organizations] = await Promise.all([
    // 0133 が未適用でもページは開けるようにする（一覧は0件になる）
    listContractChanges(supabase).catch(() => []),
    canEdit ? listWorkersForResignation(supabase).catch(() => []) : Promise.resolve([]),
    canEdit ? listOrganizations(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader title="随時報告書" backHref="/" />
      <div className="mb-4">
        <AdhocReportTabs />
      </div>
      <ContractChangesClient
        changes={changes}
        workers={workers}
        organizations={organizations}
        canEdit={canEdit}
        canDelete={me.role === "admin"}
      />
    </>
  );
}
