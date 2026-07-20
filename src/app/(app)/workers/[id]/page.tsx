import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listApplicationsByWorker } from "@/lib/supabase/queries/applications";
import { listApplicationsByWorker as listJobApplicationsByWorker } from "@/lib/supabase/queries/jobs";
import { listPostings } from "@/lib/supabase/queries/postings";
import { listJudgmentRecordsByWorker } from "@/lib/supabase/queries/tax-cert";
import { WorkerDetail } from "./WorkerDetail";

export const dynamic = "force-dynamic";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const [worker, organizations, applications, jobApplications, postings, mailingRecords] =
    await Promise.all([
      getWorkerWithHistories(supabase, id),
      listOrganizations(supabase),
      // 各テーブル未作成でも詳細ページ自体は表示できるように握りつぶす
      listApplicationsByWorker(supabase, id).catch(() => []),
      listJobApplicationsByWorker(supabase, id).catch(() => []),
      listPostings(supabase).catch(() => []),
      listJudgmentRecordsByWorker(supabase, id).catch(() => []),
    ]);
  if (!worker) notFound();

  return (
    <>
      <AppHeader title="外国人詳細" backHref="/workers" />
      <WorkerDetail
        worker={worker}
        organizations={organizations}
        applications={applications}
        jobApplications={jobApplications}
        postings={postings}
        mailingRecords={mailingRecords}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
