import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fetchPostingLedger } from "@/lib/supabase/queries/recruit-ledgers";
import { listReferralFees } from "@/lib/supabase/queries/referrals";
import { listAllApplications } from "@/lib/supabase/queries/jobs";
import { todayStr } from "@/lib/application-alerts";
import { CUSTODIAN_INFO } from "@/lib/custody";
import type { Form30Application } from "@/lib/form30";
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

  // 会社ごとの応募（求人票に紐づいていない過去データを拾い直すのに使う）
  const orgApplications: Record<string, Form30Application[]> = {};
  for (const a of applications) {
    if (!a.organization_id) continue;
    (orgApplications[a.organization_id] ??= []).push({
      worker_name: a.workers?.name ?? "",
      applied_on: a.applied_on,
      result: a.result,
      result_on: a.result_on,
    });
  }

  const postings: Form30Row[] = entries.map((p) => ({
    postingId: p.id,
    organizationId: p.organization_id,
    received_on: p.received_on,
    org_name: p.org_name,
    org_address: p.org_address,
    job_type: p.job_type,
    note: p.note,
    applications: p.applications.map((a) => ({
      worker_name: a.worker_name,
      applied_on: a.applied_on,
      result: a.result,
      result_on: a.result_on,
    })),
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
      orgApplications={orgApplications}
      today={todayStr()}
      agencyName={CUSTODIAN_INFO.officeName}
    />
  );
}
