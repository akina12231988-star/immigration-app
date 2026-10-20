import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeJapaneseYen, ClipboardList, Tag } from "lucide-react";
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
      <AppHeader title="所属機関の情報" backHref="/" />
      {/* 所属機関に関わる作業の入口。見出しの中だと小さくて見えにくいので、大きなボタンで並べる */}
      <div className="grid grid-cols-1 gap-2 px-4 pt-3 sm:grid-cols-3 lg:px-8">
        <Link
          href="/organizations/requests"
          className="flex min-h-[56px] items-center gap-3 rounded-xl border-2 border-brand bg-surface px-4 text-sm font-bold text-brand hover:bg-brand/5"
        >
          <ClipboardList size={22} className="shrink-0" />
          <span>
            会社からの書類の依頼
            <span className="block text-[11px] font-normal text-muted">年末調整の書類などを在籍者ごとにチェック</span>
          </span>
        </Link>
        <Link
          href="/organizations/address-labels"
          className="flex min-h-[56px] items-center gap-3 rounded-xl border-2 border-brand bg-surface px-4 text-sm font-bold text-brand hover:bg-brand/5"
        >
          <Tag size={22} className="shrink-0" />
          <span>
            住所印刷
            <span className="block text-[11px] font-normal text-muted">会社名・住所をテープ用にコピー／CSV</span>
          </span>
        </Link>
        <Link
          href="/organizations/wage-stats"
          className="flex min-h-[56px] items-center gap-3 rounded-xl border-2 border-brand bg-surface px-4 text-sm font-bold text-brand hover:bg-brand/5"
        >
          <BadgeJapaneseYen size={22} className="shrink-0" />
          <span>
            最低賃金の回答・地域別の時給
            <span className="block text-[11px] font-normal text-muted">改定ごとの送付・回答の状況と集計</span>
          </span>
        </Link>
      </div>
      <OrganizationsAdmin
        organizations={organizations}
        managerNames={supportManagerOptions(employees, todayStr())}
        staffNames={supportStaffOptions(employees, todayStr())}
        workerCounts={workerCounts}
      />
    </>
  );
}
