import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWageReplies } from "@/lib/supabase/queries/wage-replies";
import { dbErrorMessage } from "@/lib/errors";
import { todayStr } from "@/lib/application-alerts";
import { defaultWageNoticeValues } from "@/lib/wage-notice";
import {
  buildOrgWageData,
  type OrganizationWageReply,
  type WageStatsOrganization,
  type WageStatsWage,
  type WageStatsWorker,
} from "@/lib/wage-stats";
import { WageStatsClient } from "./WageStatsClient";

export const dynamic = "force-dynamic";

// 最低賃金の回答の管理と、地域ごとの時給の集計。
// 所属機関の情報から開く。改定（適用日）ごとに、どの機関に案内を送ったか・返事がまだかを
// 管理し、返事のあった時給（または登録済みの現在の時給）を地域ごとに平均・中央値で出す
export default async function OrganizationWageStatsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const supabase = await createClient();
  const today = todayStr();
  const [orgs, workers, wages, repliesResult] = await Promise.all([
    supabase.from("organizations").select("id, name, address, annual_work_hours").order("name"),
    supabase
      .from("workers")
      .select("id, name, status, residence_status, current_organization_id, employment_start_on, org_employment_starts")
      .eq("status", "在籍中"),
    supabase
      .from("worker_wages")
      .select("worker_id, organization_id, kind, amount, started_on, created_at")
      .not("organization_id", "is", null),
    // 回答の記録。テーブル未作成（マイグレーション未実行）でも集計は出す
    listWageReplies(supabase).then(
      (list) => ({ list, error: null as string | null }),
      (err: unknown) => ({
        list: [] as OrganizationWageReply[],
        error: dbErrorMessage(err, "0181_organization_wage_replies.sql", "回答の記録を読み込めませんでした"),
      }),
    ),
  ]);
  if (orgs.error) throw orgs.error;
  if (workers.error) throw workers.error;

  const data = buildOrgWageData(
    ((orgs.data as WageStatsOrganization[] | null) ?? []),
    ((workers.data as unknown as WageStatsWorker[] | null) ?? []),
    wages.error ? [] : ((wages.data as WageStatsWage[] | null) ?? []),
    today,
  );
  const defaults = defaultWageNoticeValues(today, "", "");

  return (
    <>
      <AppHeader title="最低賃金の回答・地域別の時給" backHref="/organizations" />
      <WageStatsClient
        data={data}
        replies={repliesResult.list}
        repliesError={repliesResult.error}
        today={today}
        defaultRound={{
          effectiveOn: defaults.effectiveOn,
          prefecture: defaults.prefecture,
          hourly: Number(defaults.hourly) || 0,
        }}
        canEdit
      />
    </>
  );
}
