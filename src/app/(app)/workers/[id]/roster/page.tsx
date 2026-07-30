import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { RosterSheet } from "./RosterSheet";

export const dynamic = "force-dynamic";

export default async function WorkerRosterPage({
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

  let orgName = "";
  if (worker.current_organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", worker.current_organization_id)
      .maybeSingle();
    orgName = data?.name ?? "";
  }

  // 前職: 終了済みの職歴（開始日昇順）
  const previousJobs = [...worker.work_histories]
    .filter((h) => h.end_date !== null)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  return (
    <RosterSheet
      orgName={orgName}
      worker={{
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth,
        gender: worker.gender,
        address: worker.address,
        field: worker.field,
        myNumber: worker.my_number,
        employmentStartOn: worker.employment_start_on,
        status: worker.status,
        leavingOn: worker.leaving_on,
        leavingKind: worker.leaving_kind,
        leavingReason: worker.leaving_reason,
      }}
      previousJobs={previousJobs.map((h) => ({ id: h.id, org: h.org_name }))}
    />
  );
}
