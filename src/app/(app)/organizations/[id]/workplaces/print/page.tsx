import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { workplaceListRows } from "@/lib/job-conditions";
import { WorkplacesPrintSheet } from "./WorkplacesPrintSheet";

export const dynamic = "force-dynamic";

// 就業場所の一覧表（A4縦）。所属機関の「求人票に記載する内容 ＞ 就業の場所」で
// 変更の可能性が「有」、就業場所が2か所以上あるときに、所属機関の画面から開く
export default async function WorkplacesPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { id } = await params;
  const org = await getOrganization(await createClient(), id).catch(() => null);
  if (!org) notFound();
  const rows = workplaceListRows(normalizeOrganizationIntake(org.intake));
  return <WorkplacesPrintSheet orgId={org.id} orgName={org.name} rows={rows} />;
}
