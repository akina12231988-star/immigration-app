import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster, getOrgUnderReviewWorkers } from "@/lib/supabase/queries/organizations";
import { listUnderReviewWorkerIdSet } from "@/lib/supabase/queries/applications";
import { splitCurrentRoster } from "@/lib/org-roster-groups";
import { nextMonthStart } from "@/lib/sales";
import { todayStr } from "@/lib/ssw/calc";
import { WageRaiseSheet } from "./WageRaiseSheet";

export const dynamic = "force-dynamic";

// 時給の一括登録（最低賃金の改定・一斉の昇給）。
// 所属機関の在籍名簿から開き、在籍中・審査中（受け取り待ち）・準備中の人に
// 「◯月◯日から 1号は◯円・2号は◯円」をまとめて登録する
export default async function OrganizationWageRaisePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const roster = await getOrgRoster(supabase, id).catch(() => ({ current: [], past: [] }));
  const { active, notYet } = splitCurrentRoster(roster.current);
  const [underReviewIds, applying] = await Promise.all([
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
  const today = todayStr();

  return (
    <>
      <AppHeader title={`時給の一括登録（${organization.name}）`} backHref={`/organizations/${id}`} />
      <WageRaiseSheet
        organizationId={id}
        organizationName={organization.name}
        active={active}
        notYet={notYet}
        applying={applying}
        underReviewIds={[...underReviewIds]}
        defaultStartedOn={nextMonthStart(today)}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
