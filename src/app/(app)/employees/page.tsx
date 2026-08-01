import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { todayStr } from "@/lib/application-alerts";
import { EmployeesClient } from "./EmployeesClient";

export const dynamic = "force-dynamic";

// 支援体制（従業員・支援責任者・支援担当者）。
// 令和9年4月1日施行の省令改正の要件を満たしているかを確認するページ
export default async function EmployeesPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const supabase = await createClient();
  const [employees, organizations, workers] = await Promise.all([
    listEmployees(supabase),
    listOrganizations(supabase),
    listWorkersForSupport(supabase),
  ]);

  return (
    <>
      <AppHeader title="支援体制（従業員）" backHref="/" />
      <EmployeesClient
        employees={employees}
        organizations={organizations.map((o) => ({ id: o.id, name: o.name, intake: o.intake }))}
        workers={workers}
        today={todayStr()}
      />
    </>
  );
}
