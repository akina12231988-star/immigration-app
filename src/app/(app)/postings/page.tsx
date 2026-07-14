import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listPostings } from "@/lib/supabase/queries/postings";
import { PostingsExplorer } from "./PostingsExplorer";

export const dynamic = "force-dynamic";

export default async function PostingsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const postings = await listPostings(supabase);

  return (
    <>
      <AppHeader title="求人管理簿" backHref="/" />
      <PostingsExplorer postings={postings} canEdit={me.role !== "viewer"} />
    </>
  );
}
