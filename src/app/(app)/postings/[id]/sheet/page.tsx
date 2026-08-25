import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getPosting } from "@/lib/supabase/queries/postings";
import { getOrganization } from "@/lib/supabase/queries/organizations";
import { normalizePostingSheet } from "@/lib/posting-sheet";
import { PostingSheetPrint } from "./PostingSheetPrint";

export const dynamic = "force-dynamic";

// 特定技能1号 求人票の印刷用（A4縦）。会社に渡す様式の形で出す
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

  return (
    <PostingSheetPrint
      posting={posting}
      sheet={normalizePostingSheet(posting.sheet)}
      orgName={posting.display_company || org?.name || posting.organizations?.name || ""}
      orgAddress={org?.address ?? ""}
      orgContact={posting.contact || org?.contact || ""}
    />
  );
}
