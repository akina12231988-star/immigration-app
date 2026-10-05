import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster } from "@/lib/supabase/queries/organizations";
import { splitCurrentRoster } from "@/lib/org-roster-groups";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { todayStr } from "@/lib/ssw/calc";
import { WageNoticeSheet } from "./WageNoticeSheet";

export const dynamic = "force-dynamic";

// 最低賃金の改定に伴う「時給のご確認」のお願い（A4横・FAX用）。
// 所属機関のページの在籍名簿から開き、在籍中の人を名簿にして印刷する
export default async function OrganizationWageNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const roster = await getOrgRoster(supabase, id).catch(() => ({ current: [], past: [] }));
  const { active } = splitCurrentRoster(roster.current);

  return (
    <WageNoticeSheet
      organizationId={organization.id}
      organizationName={organization.name}
      workers={active}
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
