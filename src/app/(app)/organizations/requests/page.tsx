import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { rosterIsCurrent } from "@/lib/supabase/queries/organizations";
import { listAllDocumentRequestChecks, listDocumentRequests } from "@/lib/supabase/queries/org-document-requests";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";
import type { DocumentRequestCheck, OrganizationDocumentRequest, RequestWorker } from "@/lib/org-document-requests";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import type { WorkerOrgEmploymentStart } from "@/types/db";
import { DocumentRequestsClient } from "./DocumentRequestsClient";

export const dynamic = "force-dynamic";

interface WorkerRow {
  id: string;
  current_organization_id: string | null;
  leaving_on: string | null;
  employment_start_on: string | null;
  org_employment_starts: WorkerOrgEmploymentStart[] | null;
}

// 所属機関からの書類の依頼（年末調整の書類など）の一覧。
// どの機関からどんな依頼が来ていて、在籍者ぶんの書類がどこまで進んだかを見る
export default async function OrganizationDocumentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { org } = await searchParams;

  const supabase = await createClient();
  const [orgs, workers, requestsResult, checksResult] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    // 在籍中の人（機関ごとの対象人数に使う）
    supabase
      .from("workers")
      .select("id, current_organization_id, leaving_on, employment_start_on, org_employment_starts")
      .eq("status", "在籍中"),
    listDocumentRequests(supabase).then(
      (list) => ({ list, error: null as string | null }),
      (err: unknown) => ({
        list: [] as OrganizationDocumentRequest[],
        error: dbErrorMessage(err, "0183_organization_document_requests.sql", "依頼を読み込めませんでした"),
      }),
    ),
    listAllDocumentRequestChecks(supabase).catch(() => [] as DocumentRequestCheck[]),
  ]);
  if (orgs.error) throw orgs.error;

  // 機関ごとの在籍者（請求書作成・名簿と同じ判定で、辞めた人は除く）と、その機関での入社日
  const workersByOrg: Record<string, RequestWorker[]> = {};
  for (const w of ((workers.data as unknown as WorkerRow[] | null) ?? [])) {
    const orgId = w.current_organization_id;
    if (!orgId || !rosterIsCurrent(w, orgId)) continue;
    const startOn =
      normalizeOrgEmploymentStarts(w.org_employment_starts).find((e) => e.organization_id === orgId && e.start_on)?.start_on ??
      w.employment_start_on;
    (workersByOrg[orgId] ??= []).push({ id: w.id, startOn });
  }

  return (
    <>
      <AppHeader title="会社からの書類の依頼" backHref="/organizations" />
      <DocumentRequestsClient
        organizations={(orgs.data as { id: string; name: string }[] | null) ?? []}
        requests={requestsResult.list}
        checks={checksResult}
        workersByOrg={workersByOrg}
        loadError={requestsResult.error}
        initialOrgId={org ?? ""}
        today={todayStr()}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
