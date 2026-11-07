import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { SalesItemsStatusClient } from "./SalesItemsStatusClient";

export const dynamic = "force-dynamic";

// 所属機関ごとの「申請種別ごとの売上明細」と収入印紙代の負担の登録状況。
// 明細を登録していない（既定のまま・明細なし）機関がどこかを一覧で確認する
export default async function OrgSalesItemsStatusPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const supabase = await createClient();
  const orgs = await listOrganizations(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="売上明細の登録状況（所属機関別）" backHref="/organizations" />
      <SalesItemsStatusClient orgs={orgs.map((o) => ({ id: o.id, name: o.name, intake: o.intake ?? {} }))} />
    </>
  );
}
