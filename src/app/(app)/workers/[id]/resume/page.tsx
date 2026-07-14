import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
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
  const histories = [...worker.work_histories].sort((a, b) =>
    a.start_date < b.start_date ? -1 : 1,
  );

  return (
    <ResumeSheet
      photoUrl={photoUrl}
      worker={{
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth,
        nationality: worker.nationality,
        residenceStatus: worker.residence_status,
        field: worker.field,
        specialtyGrade: worker.specialty_grade,
        otherQualifications: worker.other_qualifications,
      }}
      histories={histories.map((h) => ({
        id: h.id,
        visa: h.visa,
        start: h.start_date,
        end: h.end_date,
        org: h.org_name,
        role: h.role,
      }))}
    />
  );
}
