import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listSupportEnds } from "@/lib/supabase/queries/support-end";
import { listWorkersForSupportEnd } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { AdhocReportTabs } from "../AdhocReportTabs";
import { SupportEndClient } from "./SupportEndClient";

export const dynamic = "force-dynamic";

export default async function SupportEndPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const canEdit = me.role !== "viewer";
  const [records, workers, organizations] = await Promise.all([
    // 0135 が未適用でもページは開けるようにする（一覧は0件になる）
    listSupportEnds(supabase).catch(() => []),
    canEdit ? listWorkersForSupportEnd(supabase).catch(() => []) : Promise.resolve([]),
    canEdit ? listOrganizations(supabase).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader title="随時報告書" backHref="/" />
      <div className="mb-4">
        <AdhocReportTabs />
      </div>
      <SupportEndClient
        records={records}
        workers={workers}
        organizations={organizations}
        canEdit={canEdit}
        canDelete={me.role === "admin"}
      />
    </>
  );
}
