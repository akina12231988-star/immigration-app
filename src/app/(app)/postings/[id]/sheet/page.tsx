import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getPosting } from "@/lib/supabase/queries/postings";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { normalizePostingSheet } from "@/lib/posting-sheet";
import { PostingSheetPrint } from "./PostingSheetPrint";

export const dynamic = "force-dynamic";

// 特定技能1号 求人票。会社に渡す様式の形のまま画面で書けて、そのまま印刷できる
export default async function PostingSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const posting = await getPosting(supabase, id).catch(() => null);
  if (!posting) notFound();

  const org = posting.organization_id
    ? await getOrganization(supabase, posting.organization_id).catch(() => null)
    : null;

  // 求人票は労働局に出す様式なので、Facebook掲載用の伏せた会社名（display_company）ではなく
  // 所属機関の正式な名前を出す
  const orgName = org?.name || posting.organizations?.name || "";

  return (
    <PostingSheetPrint
      posting={posting}
      sheet={normalizePostingSheet(posting.sheet)}
      orgName={orgName}
      orgAddress={org?.address ?? ""}
      orgContact={posting.contact || org?.contact || ""}
      canEdit={me.role !== "viewer"}
    />
  );
}
