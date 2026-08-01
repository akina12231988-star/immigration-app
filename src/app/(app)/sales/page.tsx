import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersForBilling } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { todayStr } from "@/lib/ssw/calc";
import { BillingClient } from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  // 月末の集計は在籍名簿の全件を使う。読めなくても売上明細の登録は使えるようにする
  const [workers, organizations] = await Promise.all([
    listWorkersForBilling(supabase).catch(() => []),
    listOrganizations(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="請求書作成" />
      <BillingClient
        canEdit={me.role !== "viewer"}
        workers={workers}
        organizations={organizations}
        today={todayStr()}
      />
    </>
  );
}
