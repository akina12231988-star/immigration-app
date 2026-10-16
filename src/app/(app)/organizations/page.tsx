import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeJapaneseYen } from "lucide-react";
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
import { OrganizationsAdmin } from "../admin/organizations/OrganizationsAdmin";

export const dynamic = "force-dynamic";

// 所属機関の情報。会社・機関マスタと同じ内容をナビから開けるようにしたページ
// （編集は admin/staff。閲覧のみのユーザーはホームへ）
export default async function OrganizationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

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
      <AppHeader
        title="所属機関の情報"
        backHref="/"
        right={
          // 最低賃金の改定ごとの回答状況と、地域ごとの時給の集計
          <Link
            href="/organizations/wage-stats"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brand-foreground/60 px-3 text-xs font-bold text-brand-foreground hover:bg-brand-foreground/10"
          >
            <BadgeJapaneseYen size={14} />
            最低賃金の回答・地域別の時給
          </Link>
        }
      />
      <OrganizationsAdmin
        organizations={organizations}
        managerNames={supportManagerOptions(employees, todayStr())}
        staffNames={supportStaffOptions(employees, todayStr())}
        workerCounts={workerCounts}
      />
    </>
  );
}
