import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrgRoster, getOrganization } from "@/lib/supabase/queries/organizations";
import { listEmployees } from "@/lib/supabase/queries/employees";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import {
  isSupportedSsw1,
  supportManagerOptions,
  supportStaffOptions,
} from "@/lib/support-system";
import { todayStr } from "@/lib/application-alerts";
import { OrganizationRoster } from "@/components/organizations/OrganizationRoster";
import { OrganizationDetail } from "./OrganizationDetail";

export const dynamic = "force-dynamic";

// 所属機関の詳細。登録済みの内容は表示し、未記入の欄だけこの画面で入力・保存できる
// （登録済み内容の修正は一覧の鉛筆ボタンから）
export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const { id } = await params;
  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  const [employees, workers, roster] = await Promise.all([
    listEmployees(supabase),
    listWorkersForSupport(supabase),
    // 在籍者・過去の在籍者。取得に失敗しても機関の画面は開けるようにするが、
    // 「0名」と紛らわしく見せないよう、失敗した事実は画面に出す
    getOrgRoster(supabase, id).then(
      (r) => ({ ...r, error: null as string | null }),
      (e: unknown) => ({
        current: [],
        past: [],
        error: e instanceof Error ? e.message : "在籍者の取得に失敗しました",
      }),
    ),
  ]);
  const workerCount = workers.filter(
    (w) => w.current_organization_id === id && isSupportedSsw1(w),
  ).length;

  return (
    <>
      <AppHeader title={organization.name} backHref="/organizations" />
      <OrganizationDetail
        organization={organization}
        managerNames={supportManagerOptions(employees, todayStr())}
        staffNames={supportStaffOptions(employees, todayStr())}
        workerCount={workerCount}
      />
      <div className="mt-4">
        <OrganizationRoster
          current={roster.current}
          past={roster.past}
          error={roster.error}
        />
      </div>
    </>
  );
}
