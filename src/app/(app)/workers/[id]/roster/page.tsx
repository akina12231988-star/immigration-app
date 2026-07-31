import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { listWorkerRosters } from "@/lib/supabase/queries/rosters";
import { normalizeOrgEmploymentStarts } from "@/lib/org-employment";
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

  // worker_rosters 未作成でもページ自体は表示できるように握りつぶす
  const rosters = await listWorkerRosters(supabase, id).catch(() => []);

  // 機関名の解決と、所属機関別の雇用開始日（会社名→開始日）の組み立て
  const { data: orgRows } = await supabase.from("organizations").select("id, name");
  const orgNameById = new Map(
    ((orgRows as { id: string; name: string }[]) ?? []).map((o) => [o.id, o.name]),
  );
  const orgName = worker.current_organization_id
    ? (orgNameById.get(worker.current_organization_id) ?? "")
    : "";
  const employmentStarts = normalizeOrgEmploymentStarts(worker.org_employment_starts)
    .filter((e) => e.start_on && orgNameById.has(e.organization_id))
    .map((e) => ({
      orgName: orgNameById.get(e.organization_id) as string,
      startOn: e.start_on,
    }));

  // 前職の初期値: 終了済みの職歴（開始日昇順）
  const previousJobs = [...worker.work_histories]
    .filter((h) => h.end_date !== null && h.org_name)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  return (
    <RosterSheet
      workerId={worker.id}
      canEdit={me.role !== "viewer"}
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
      defaultPreviousJobs={previousJobs.map((h) => h.org_name)}
      employmentStarts={employmentStarts}
      initialRosters={rosters}
    />
  );
}
