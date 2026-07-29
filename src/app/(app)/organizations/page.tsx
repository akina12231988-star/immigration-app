import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { OrganizationsAdmin } from "../admin/organizations/OrganizationsAdmin";

export const dynamic = "force-dynamic";

// 所属機関の情報。会社・機関マスタと同じ内容をナビから開けるようにしたページ
// （編集は admin/staff。閲覧のみのユーザーはホームへ）
export default async function OrganizationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/");

  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  return (
    <>
      <AppHeader title="所属機関の情報" backHref="/" />
      <OrganizationsAdmin organizations={organizations} />
    </>
  );
}
