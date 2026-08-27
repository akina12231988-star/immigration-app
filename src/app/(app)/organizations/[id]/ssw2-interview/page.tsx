import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { ssw2DutiesOf } from "@/lib/org-ssw2-duties";
import { todayStr } from "@/lib/ssw/calc";
import { Ssw2InterviewSheet } from "./Ssw2InterviewSheet";

export const dynamic = "force-dynamic";

// 特定技能2号の誓約書を書くために、会社へ聞き取りをするときの質問票（印刷用）。
export default async function Ssw2InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { id } = await params;

  const supabase = await createClient();
  const organization = await getOrganization(supabase, id);
  if (!organization) notFound();

  return (
    <Ssw2InterviewSheet
      orgId={id}
      orgName={organization.name}
      duties={ssw2DutiesOf(organization)}
      today={todayStr()}
    />
  );
}
