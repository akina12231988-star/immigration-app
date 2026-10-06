import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster, getOrgUnderReviewWorkers } from "@/lib/supabase/queries/organizations";
import { listUnderReviewWorkerIdSet } from "@/lib/supabase/queries/applications";
import { splitCurrentRoster } from "@/lib/org-roster-groups";
import { pickWageNoticeWorkers } from "@/lib/wage-notice";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { todayStr } from "@/lib/ssw/calc";
import { WageNoticeSheet } from "./WageNoticeSheet";

export const dynamic = "force-dynamic";

// 最低賃金の改定に伴う「時給のご確認」のお願い（A4横・FAX用）。
// 所属機関のページの在籍名簿から開き、在籍中の人と、申請が審査中（在留カードの受け取りがまだ）の人を名簿にして印刷する
export default async function OrganizationWageNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const roster = await getOrgRoster(supabase, id).catch(() => ({ current: [], past: [] }));
  const { active, notYet } = splitCurrentRoster(roster.current);
  // 審査中（申請を出していて在留カードの受け取りがまだ）の人も名簿に載せる。
  //  1. この機関に紐づいているがまだ「在籍中」ではない人（申請準備中など）のうち、申請が審査中の人
  //  2. この機関への申請が審査中の人（在留認定・転職の人は在留カードを受け取るまで
  //     「現在の所属機関」がこの機関にならないため、在籍名簿には出てこない）
  const [linkedUnderReviewIds, applying] = await Promise.all([
    listUnderReviewWorkerIdSet(
      supabase,
      notYet.map((w) => w.id),
    ).catch(() => new Set<string>()),
    getOrgUnderReviewWorkers(
      supabase,
      id,
      new Set(roster.current.map((w) => w.id)),
    ).catch(() => []),
  ]);
  const underReviewIds = new Set([...linkedUnderReviewIds, ...applying.map((w) => w.id)]);
  const workers = pickWageNoticeWorkers(active, [...notYet, ...applying], underReviewIds);

  return (
    <WageNoticeSheet
      organizationId={organization.id}
      organizationName={organization.name}
      workers={workers}
      today={todayStr()}
      staffName={me.display_name}
      fax={CUSTODIAN_INFO.tel}
      office={{
        name: CUSTODIAN_INFO.officeName,
        registrationNo: CUSTODIAN_INFO.registrationNo,
        address: CUSTODIAN_INFO.address,
        tel: CUSTODIAN_INFO.tel,
      }}
    />
  );
}
