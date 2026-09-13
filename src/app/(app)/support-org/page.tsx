import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { todayStr } from "@/lib/application-alerts";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo, mergeSupportOrgLists } from "@/lib/custody";
import { EmployeesClient } from "../employees/EmployeesClient";
import { SupportOrgInfoForm } from "./SupportOrgInfoForm";

export const dynamic = "force-dynamic";

// 登録支援機関（当社）のページ。
//  ・上: 登録支援機関の情報（申請書の所属機関等作成用 4 に書く内容。ここで登録・変更する）
//  ・下: 支援体制（従業員・支援責任者・支援担当者。省令改正の要件を満たしているかの確認）
export default async function SupportOrgPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const supabase = await createClient();
  const [custodian, employees, organizations, workers] = await Promise.all([
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
    listEmployees(supabase),
    listOrganizations(supabase),
    listWorkersForSupport(supabase),
  ]);

  return (
    <>
      <AppHeader title="登録支援機関" backHref="/" />
      <div className="flex flex-col gap-4">
        <SupportOrgInfoForm
          initial={mergeCustodianInfo(custodian)}
          initialLists={mergeSupportOrgLists(custodian)}
          canEdit
        />
        <h2 className="text-sm font-bold">支援体制（従業員）</h2>
        <EmployeesClient
          employees={employees}
          organizations={organizations.map((o) => ({ id: o.id, name: o.name, intake: o.intake }))}
          workers={workers}
          today={todayStr()}
        />
      </div>
    </>
  );
}
