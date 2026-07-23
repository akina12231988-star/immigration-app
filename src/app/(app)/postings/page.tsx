import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listPostings } from "@/lib/supabase/queries/postings";
import { PostingsExplorer } from "./PostingsExplorer";

export const dynamic = "force-dynamic";

export default async function PostingsPage() {
  // ログイン確認とデータ取得を並列に行い、ページ表示までの待ち時間を短縮する
  const supabase = await createClient();
  const [me, postings] = await Promise.all([
    getMyProfile(),
    listPostings(supabase),
  ]);
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="求人管理簿" backHref="/" />
      <PostingsExplorer postings={postings} canEdit={me.role !== "viewer"} />
    </>
  );
}
