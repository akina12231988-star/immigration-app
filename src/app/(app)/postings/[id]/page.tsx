import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getPosting } from "@/lib/supabase/queries/postings";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listApplicationsByPosting } from "@/lib/supabase/queries/jobs";
import { PostingDetail } from "./PostingDetail";

export const dynamic = "force-dynamic";

export default async function PostingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const [posting, organizations, applicants] = await Promise.all([
    getPosting(supabase, id),
    listOrganizations(supabase),
    listApplicationsByPosting(supabase, id),
  ]);
  if (!posting) notFound();

  return (
    <>
      <AppHeader title="求人詳細" backHref="/postings" />
      <PostingDetail
        posting={posting}
        organizations={organizations}
        applicants={applicants}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
