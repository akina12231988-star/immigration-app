import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fetchPostingLedger } from "@/lib/supabase/queries/recruit-ledgers";
import { listReferralFees } from "@/lib/supabase/queries/referrals";
import { listAllApplications } from "@/lib/supabase/queries/jobs";
import { todayStr } from "@/lib/application-alerts";
import { CUSTODIAN_INFO } from "@/lib/custody";
import { Form30Client, type Form30Row } from "./Form30Client";

export const dynamic = "force-dynamic";

// 様式30（求人者リスト）の作成。労働局の訪問指導の前に提出する。
// 手数料管理簿で入金済みの企業だけを載せる運用のため、入金の状況を並べて選べるようにする
export default async function Form30Page() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [entries, fees, applications] = await Promise.all([
    fetchPostingLedger(supabase).catch(() => []),
    // 0067未適用でも画面は開けるようにする（そのときは全件「台帳に無し」になる）
    listReferralFees(supabase).catch(() => []),
    // 応募が求人票に紐づいていない過去データを取りこぼさないよう、会社ごとの応募日も渡す
    listAllApplications(supabase).catch(() => []),
  ]);

  const orgReferredDates: Record<string, string[]> = {};
  for (const a of applications) {
    if (!a.organization_id) continue;
    (orgReferredDates[a.organization_id] ??= []).push(a.applied_on);
  }

  const postings: Form30Row[] = entries.map((p) => ({
    postingId: p.id,
    organizationId: p.organization_id,
    received_on: p.received_on,
    org_name: p.org_name,
    org_address: p.org_address,
    job_type: p.job_type,
    note: p.note,
    referred_dates: p.applications.map((a) => a.applied_on),
  }));

  return (
    <Form30Client
      postings={postings}
      fees={fees.map((f) => ({
        organization_id: f.organization_id,
        worker_name: f.worker_name || (f.workers?.name ?? ""),
        billed_on: f.billed_on,
        paid_on: f.paid_on,
      }))}
      orgReferredDates={orgReferredDates}
      today={todayStr()}
      agencyName={CUSTODIAN_INFO.officeName}
    />
  );
}
