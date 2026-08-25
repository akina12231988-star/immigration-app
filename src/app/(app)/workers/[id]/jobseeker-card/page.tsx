import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { listApplicationsByWorker } from "@/lib/supabase/queries/jobs";
import { jobseekerCerts, normalizeJobseekerCard } from "@/lib/jobseeker-card";
import { JobseekerCardSheet } from "./JobseekerCardSheet";

export const dynamic = "force-dynamic";

// 求職票（求職申込書）。労働局の訪問指導で求職管理簿と一緒に見せる1人分の申込内容
export default async function JobseekerCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const worker = await getWorkerWithHistories(supabase, id);
  if (!worker) notFound();

  // 応募がまだ無くても求職票は出せるようにする
  const apps = await listApplicationsByWorker(supabase, id).catch(() => []);

  return (
    <JobseekerCardSheet
      workerId={worker.id}
      canEdit={me.role !== "viewer"}
      worker={{
        jobseekerNo: worker.jobseeker_no ?? "",
        acceptedOn: worker.jobseeker_accepted_on ?? "",
        validUntil: worker.jobseeker_valid_until ?? "",
        name: worker.name,
        kana: worker.kana,
        gender: worker.gender,
        birth: worker.birth ?? "",
        nationality: worker.nationality,
        address: worker.address,
        homeAddress: worker.home_address,
        residenceStatus: worker.residence_status,
        residencePeriod: worker.residence_period,
        residenceExpiry: worker.residence_expiry_date ?? "",
        residenceCardNo: worker.residence_card_no,
        passportNo: worker.passport_no,
        passportExpiry: worker.passport_expiry_date ?? "",
        field: worker.field,
      }}
      // 0118 がまだ適用されていないDBでも、空のまま画面が出るようにしている
      extras={normalizeJobseekerCard(worker.jobseeker_card)}
      certs={jobseekerCerts(worker)}
      histories={(worker.work_histories ?? []).map((h) => ({
        id: h.id,
        visa: h.visa,
        start: h.start_date,
        end: h.end_date,
        org: h.org_name,
        role: h.role,
      }))}
      // 紹介の記録は求職管理簿と同じ並び（古い順）にする
      referrals={[...apps]
        .sort((a, b) => (a.applied_on ?? "").localeCompare(b.applied_on ?? ""))
        .map((a) => ({
          appliedOn: a.applied_on ?? "",
          acceptanceNo: a.job_postings?.acceptance_no ?? "",
          employerName: a.organizations?.name ?? a.job_postings?.display_company ?? "",
          result: a.result,
          resultOn: a.result_on ?? "",
        }))}
    />
  );
}
