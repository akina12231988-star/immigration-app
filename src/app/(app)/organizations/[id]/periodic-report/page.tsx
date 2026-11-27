import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster } from "@/lib/supabase/queries/organizations";
import { listGrantedPermits, listPermitHistoryExtras } from "@/lib/supabase/queries/applications";
import { listOrgPayrollItems, listPeriodicReportEntries } from "@/lib/supabase/queries/periodic-report";
import { todayStr } from "@/lib/ssw/calc";
import type { PayrollPermit, PayrollRequestCandidate } from "@/lib/payroll-request";
import { PeriodicReportClient } from "./PeriodicReportClient";

export const dynamic = "force-dynamic";

// 定期報告書（3-6号）のための賃金台帳の入力。
// 機関ごとに賃金台帳の項目（名前・並び・3-6号のどの欄か）を登録し、
// 届いた賃金台帳を見ながら人×月で転記すると、3-6号の平均値（労働条件等・昇給率）が出る。
// マイグレーション 0236_periodic_report.sql が必要
export default async function OrganizationPeriodicReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const roster = await getOrgRoster(supabase, id).catch(() => ({ current: [], past: [] }));
  const candidates: PayrollRequestCandidate[] = [...roster.current, ...roster.past].map((w) => ({
    id: w.id,
    name: w.name,
    kana: w.kana,
    nationality: w.nationality,
    residenceStatus: w.residenceStatus,
    residencePermitDate: w.residencePermitDate,
    startOn: w.startOn,
    leavingOn: w.leavingOn,
  }));

  const ids = new Set(candidates.map((c) => c.id));
  // 項目・実績はマイグレーション未適用の環境でも開けるよう、読めなければ空で出す（画面に案内を出す）
  const [granted, extras, itemsResult, entriesResult] = await Promise.all([
    listGrantedPermits(supabase).catch(() => []),
    listPermitHistoryExtras(supabase).catch(() => []),
    listOrgPayrollItems(supabase, id).then(
      (items) => ({ items, ok: true }),
      () => ({ items: [], ok: false }),
    ),
    // 実績は全期間分（前年度との比較・年度の切り替えに使う。件数は機関×月なので多くない）
    listPeriodicReportEntries(supabase, id, "1900-01", "2999-12").catch(() => []),
  ]);
  const permitsByWorker: Record<string, PayrollPermit[]> = {};
  for (const p of [...granted, ...extras]) {
    if (!ids.has(p.workerId)) continue;
    (permitsByWorker[p.workerId] ??= []).push({ permitDate: p.permitDate, visa: p.visa });
  }

  return (
    <PeriodicReportClient
      organizationId={organization.id}
      organizationName={organization.name}
      candidates={candidates}
      permitsByWorker={permitsByWorker}
      initialItems={itemsResult.items}
      initialEntries={entriesResult}
      tablesReady={itemsResult.ok}
      today={todayStr()}
    />
  );
}
