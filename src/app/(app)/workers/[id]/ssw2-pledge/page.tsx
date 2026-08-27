import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { listSsw2Instructees } from "@/lib/supabase/queries/ssw2-instructees";
import { ssw2DutiesOf } from "@/lib/org-ssw2-duties";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { todayStr } from "@/lib/ssw/calc";
import { Ssw2PledgeClient } from "./Ssw2PledgeClient";

export const dynamic = "force-dynamic";

// 特定技能2号の申請で出す「業務内容に関する誓約書」（参考様式第１－３２号）の出力ページ。
// 外国人・所属機関・指導対象者の登録内容をそのまま差し込んで Word で出す。
export default async function Ssw2PledgePage({
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

  // 申請準備で選んだ所属機関があればそちら（転職の場合の転職先）
  const orgId = worker.application_prep_organization_id || worker.current_organization_id;
  const [organization, instructees] = await Promise.all([
    orgId ? getOrganization(supabase, orgId).catch(() => null) : Promise.resolve(null),
    listSsw2Instructees(supabase, id).catch(() => []),
  ]);
  const intake = normalizeOrganizationIntake(organization?.intake);

  return (
    <>
      <AppHeader title={`${worker.name}｜２号の誓約書`} backHref={`/workers/${id}`} />
      <Ssw2PledgeClient
        workerId={id}
        workerName={worker.name}
        residenceCardNo={worker.residence_card_no}
        orgId={orgId}
        orgName={organization?.name ?? ""}
        orgAddress={organization?.address ?? ""}
        // 作成責任者は所属機関の代表者（役職・氏名）を初期値にする
        authorName={intake.rep_name}
        duties={ssw2DutiesOf(organization)}
        instructees={instructees}
        today={todayStr()}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
