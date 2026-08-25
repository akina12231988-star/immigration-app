import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
import { mergeResumeHistories } from "@/lib/resume-histories";
import { getWorkerPhotoUrl } from "../../actions";
import { ResumeSheet } from "./ResumeSheet";

export const dynamic = "force-dynamic";

export default async function WorkerResumePage({
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

  const photoUrl = await getWorkerPhotoUrl(worker.photo_path);

  // 職歴に、所属機関別の雇用開始日と退職の記録を自動で足す（手入力済みの機関は足さない）
  const [{ data: orgRows }, { data: resignationRows }] = await Promise.all([
    supabase.from("organizations").select("id, name"),
    supabase
      .from("resignations")
      .select("organization_id, org_name, leaving_on")
      .eq("worker_id", worker.id),
  ]);
  const orgNameById = new Map(
    ((orgRows as { id: string; name: string }[]) ?? []).map((o) => [o.id, o.name]),
  );
  const histories = mergeResumeHistories({
    histories: worker.work_histories,
    employmentStarts: normalizeOrgEmploymentStarts(worker.org_employment_starts)
      .filter((e) => orgNameById.has(e.organization_id))
      .map((e) => ({ ...e, orgName: orgNameById.get(e.organization_id) as string })),
    resignations:
      (resignationRows as { organization_id: string | null; org_name: string; leaving_on: string | null }[]) ??
      [],
    residenceStatus: worker.residence_status,
    currentOrganizationId: worker.current_organization_id,
    workerStatus: worker.status,
    workerLeavingOn: worker.leaving_on,
  });

  return (
    <ResumeSheet
      workerId={worker.id}
      canEdit={me.role !== "viewer"}
      photoUrl={photoUrl}
      worker={{
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth,
        gender: worker.gender,
        address: worker.address,
        nationality: worker.nationality,
        residenceStatus: worker.residence_status,
        field: worker.field,
        specialtyGrade: worker.specialty_grade,
        otherQualifications: worker.other_qualifications,
      }}
      histories={histories}
    />
  );
}
