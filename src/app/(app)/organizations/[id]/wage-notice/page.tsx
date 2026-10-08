import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster, getOrgUnderReviewWorkers } from "@/lib/supabase/queries/organizations";
import { listUnderReviewWorkerIdSet } from "@/lib/supabase/queries/applications";
import { listWorkersForBilling } from "@/lib/supabase/queries/workers";
import { splitCurrentRoster } from "@/lib/org-roster-groups";
import { currentMonth, summarizeMonthlyBilling } from "@/lib/monthly-billing";
import { pickWageNoticeWorkers, wageNoticeExcluded } from "@/lib/wage-notice";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { todayStr } from "@/lib/ssw/calc";
import { WageNoticeSheet } from "./WageNoticeSheet";

export const dynamic = "force-dynamic";

// 最低賃金の改定に伴う「時給のご確認」のお願い（A4横・FAX用）。
// 所属機関のページの在籍名簿から開き、在籍中の人と、申請が審査中（在留カードの受け取りがまだ）の人を名簿にして印刷する。
// 状態の変え忘れで漏れないよう、今月の請求書作成の名簿に載っている人も在籍中として載せる
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
  const today = todayStr();
  const [linkedUnderReviewIds, applying, billedIds] = await Promise.all([
    listUnderReviewWorkerIdSet(
      supabase,
      notYet.map((w) => w.id),
    ).catch(() => new Set<string>()),
    getOrgUnderReviewWorkers(
      supabase,
      id,
      new Set(roster.current.map((w) => w.id)),
    ).catch(() => []),
    // 今月の請求書作成の名簿（支援費を請求する人）に載っている人。
    // 状態が「在籍中」になっていなくても、請求している人は在籍しているので名簿に載せる
    billedWorkerIdsThisMonth(supabase, id, today),
  ]);
  const underReviewIds = new Set([...linkedUnderReviewIds, ...applying.map((w) => w.id)]);
  const workers = pickWageNoticeWorkers(active, [...notYet, ...applying], underReviewIds, billedIds);
  // この機関に紐づいているのに名簿に載らない人（画面で理由を確認できるようにする）
  const excluded = wageNoticeExcluded(notYet, underReviewIds, billedIds);

  return (
    <WageNoticeSheet
      organizationId={organization.id}
      organizationName={organization.name}
      workers={workers}
      excluded={excluded}
      today={today}
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

// 今月の請求書作成の名簿で、この機関の行に載る人のID（請求書作成とまったく同じ判定を使う）。
// 当月中に退職・転職して出ていった人の行（退職精算）は在籍中ではないので除く。
// 取れないときは空（在籍中・審査中の判定だけで名簿を作る）
async function billedWorkerIdsThisMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  today: string,
): Promise<Set<string>> {
  try {
    const workers = await listWorkersForBilling(supabase);
    const billing = summarizeMonthlyBilling(workers, [], currentMonth(today));
    const org = billing.orgs.find((o) => o.organizationId === organizationId);
    return new Set(
      (org?.rows ?? []).filter((r) => !r.leftThisMonth && !r.transferredOut).map((r) => r.worker.id),
    );
  } catch {
    return new Set();
  }
}
