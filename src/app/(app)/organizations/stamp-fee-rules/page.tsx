import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { normalizeStampFeeOrgRules, STAMP_FEE_RULES_SETTING_KEY } from "@/lib/stamp-fee";
import { todayStr } from "@/lib/application-alerts";
import { StampFeeRulesClient } from "./StampFeeRulesClient";

export const dynamic = "force-dynamic";

// 申請準備の収入印紙代の自動設定。所属機関ごとに更新・新規の申請の負担を決めておく
export default async function StampFeeRulesPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");
  const supabase = await createClient();
  const [organizations, saved] = await Promise.all([
    listOrganizations(supabase).catch(() => []),
    getAppSetting(supabase, STAMP_FEE_RULES_SETTING_KEY).catch(() => null),
  ]);
  return (
    <>
      <AppHeader title="印紙代の自動設定" backHref="/organizations" />
      <StampFeeRulesClient
        initialRules={normalizeStampFeeOrgRules(saved)}
        orgNames={organizations.map((o) => o.name)}
        today={todayStr()}
      />
    </>
  );
}
