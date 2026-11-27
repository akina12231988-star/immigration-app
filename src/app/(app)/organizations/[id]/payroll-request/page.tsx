import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization, getOrgRoster } from "@/lib/supabase/queries/organizations";
import { listGrantedPermits, listPermitHistoryExtras } from "@/lib/supabase/queries/applications";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_INFO, CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { todayStr } from "@/lib/ssw/calc";
import type { PayrollPermit, PayrollRequestCandidate } from "@/lib/payroll-request";
import { PayrollRequestSheet } from "./PayrollRequestSheet";

export const dynamic = "force-dynamic";

// 定期届出（3-6号）の準備のための「賃金台帳・証明書のお願い」（A4縦・FAX用）。
// 所属機関のページの在籍名簿から開く。対象年度に特定技能1号・2号として在籍していた人
// （年度の途中で退職した人を含む）を名簿にし、特定技能の許可日より前（特定活動など）の
// 月はお願いする期間から外す。証明書のリストは画面で自由に直せる
export default async function OrganizationPayrollRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const roster = await getOrgRoster(supabase, id).catch(() => ({ current: [], past: [] }));
  // 名簿の候補: 今この機関にいる人＋過去にこの機関に在籍していた人。
  // 年度と重なるかどうかの判定は画面側（年度を変えて作り直せるように）
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

  // 在留許可の履歴（申請一覧の許可欄＋手入力の履歴＋在留カードの記録）。
  // 「いつから特定技能1号・2号か」を割り出すのに使う。読めなかった分は無しで続ける
  const ids = new Set(candidates.map((c) => c.id));
  const [granted, extras, custodian] = await Promise.all([
    listGrantedPermits(supabase).catch(() => []),
    listPermitHistoryExtras(supabase).catch(() => []),
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
  ]);
  const permitsByWorker: Record<string, PayrollPermit[]> = {};
  for (const p of [...granted, ...extras]) {
    if (!ids.has(p.workerId)) continue;
    (permitsByWorker[p.workerId] ??= []).push({ permitDate: p.permitDate, visa: p.visa });
  }

  const office = mergeCustodianInfo(custodian);

  return (
    <PayrollRequestSheet
      organizationId={organization.id}
      organizationName={organization.name}
      candidates={candidates}
      permitsByWorker={permitsByWorker}
      today={todayStr()}
      staffName={me.display_name}
      fax={office.fax || CUSTODIAN_INFO.tel}
      office={{
        name: office.officeName,
        registrationNo: office.registrationNo,
        address: office.address,
        tel: office.tel,
      }}
    />
  );
}
