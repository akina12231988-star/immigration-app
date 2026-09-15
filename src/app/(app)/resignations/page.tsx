import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import {
  listResignations,
  retireWorkersPastLeavingDate,
} from "@/lib/supabase/queries/resignations";
import { todayStr } from "@/lib/application-alerts";
import { listWorkersForResignation } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { AdhocReportTabs } from "./AdhocReportTabs";
import { ResignationsClient } from "./ResignationsClient";

export const dynamic = "force-dynamic";

export default async function ResignationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const canEdit = me.role !== "viewer";
  // 退職日を過ぎた人は、ここで自動でステータスを「退職」にする（記録時は在籍中のまま）
  if (canEdit) await retireWorkersPastLeavingDate(supabase, todayStr()).catch(() => 0);
  const [resignations, workers, organizations] = await Promise.all([
    listResignations(supabase).catch(() => []),
    canEdit ? listWorkersForResignation(supabase).catch(() => []) : Promise.resolve([]),
    canEdit ? listOrganizations(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader title="随時報告書" backHref="/" />
      <div className="mb-4">
        <AdhocReportTabs />
      </div>
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
