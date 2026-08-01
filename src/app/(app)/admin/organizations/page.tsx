import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import {
  summarizeOrganizations,
  supportManagerOptions,
  supportStaffOptions,
} from "@/lib/support-system";
import { todayStr } from "@/lib/application-alerts";
import { OrganizationsAdmin } from "./OrganizationsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const supabase = await createClient();
  const [organizations, employees, workers] = await Promise.all([
    listOrganizations(supabase),
    listEmployees(supabase),
    listWorkersForSupport(supabase),
  ]);
  const workerCounts = Object.fromEntries(
    summarizeOrganizations(organizations, workers).map((o) => [o.organizationId, o.workerCount]),
  );

  return (
    <>
      <AppHeader title="会社・機関マスタ" backHref="/" />
      <OrganizationsAdmin
        organizations={organizations}
        managerNames={supportManagerOptions(employees, todayStr())}
        staffNames={supportStaffOptions(employees, todayStr())}
        workerCounts={workerCounts}
      />
    </>
  );
}
