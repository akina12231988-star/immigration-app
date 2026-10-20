import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster } from "@/lib/supabase/queries/organizations";
import { getDocumentRequest, listDocumentRequestChecks } from "@/lib/supabase/queries/org-document-requests";
import { splitCurrentRoster } from "@/lib/org-roster-groups";
import { todayStr } from "@/lib/application-alerts";
import { DocumentRequestChecklist } from "./DocumentRequestChecklist";

export const dynamic = "force-dynamic";

// 1件の依頼のチェック表。その機関の在籍者 × 書類の項目で、案内・発行・会社への送付を記録する
export default async function OrganizationDocumentRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const request = await getDocumentRequest(supabase, id);
  if (!request) notFound();

  const [organization, roster, checks] = await Promise.all([
    getOrganization(supabase, request.organization_id),
    getOrgRoster(supabase, request.organization_id).catch(() => ({ current: [], past: [] })),
    listDocumentRequestChecks(supabase, id).catch(() => []),
  ]);
  const { active, notYet } = splitCurrentRoster(roster.current);
  // 本人に案内するときにすぐ開けるよう、Messenger のリンクも渡す（名簿には入っていないので別に読む）
  const messengerById = new Map<string, string>();
  if (active.length > 0) {
    const { data } = await supabase
      .from("workers")
      .select("id, messenger_link")
      .in("id", active.map((w) => w.id));
    for (const w of ((data as { id: string; messenger_link: string | null }[] | null) ?? [])) {
      if (w.messenger_link) messengerById.set(w.id, w.messenger_link);
    }
  }

  return (
    <>
      <AppHeader title="会社からの書類の依頼" backHref="/organizations/requests" />
      <DocumentRequestChecklist
        request={request}
        organizationName={organization?.name ?? "所属機関"}
        workers={active.map((w) => ({
          id: w.id,
          name: w.name,
          kana: w.kana,
          nationality: w.nationality,
          startOn: w.startOn,
          messengerLink: messengerById.get(w.id) ?? "",
        }))}
        notYetCount={notYet.length}
        initialChecks={checks}
        today={todayStr()}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
