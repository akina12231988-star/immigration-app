import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { todayStr } from "@/lib/ssw/calc";
import { ReferralsClient, type ReferralWorkerOption } from "./ReferralsClient";

export const dynamic = "force-dynamic";

// 紹介手数料台帳: 全所属機関のあっせん（人材紹介）手数料をまとめて管理し、
// 請求年月日・入金年月日を記録する
export default async function ReferralsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  // 外国人は追加フォームの候補用（読めなくても台帳の表示は使えるようにする）
  const [workersRes, organizations] = await Promise.all([
    supabase
      .from("workers")
      .select("id, name, current_organization_id, residence_permit_date, residence_status")
      .order("name", { ascending: true }),
    listOrganizations(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="紹介手数料台帳" />
      <ReferralsClient
        canEdit={me.role !== "viewer"}
        workers={(workersRes.data as ReferralWorkerOption[] | null) ?? []}
        organizations={organizations}
        today={todayStr()}
      />
    </>
  );
}
