import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization } from "@/lib/supabase/queries/organizations";
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

  return (
    <>
      <AppHeader title={organization.name} backHref="/organizations" />
      <OrganizationDetail organization={organization} />
    </>
  );
}
