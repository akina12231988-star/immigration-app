import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listIssueRequests } from "@/lib/supabase/queries/issue-requests";
import { IssueRequestsClient } from "./IssueRequestsClient";

export const dynamic = "force-dynamic";

export default async function IssueRequestsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  // 取得に失敗しても画面は開けるようにし、失敗した事実だけ出す（0件と紛らわしくしない）
  const { rows, error } = await listIssueRequests(supabase).then(
    (r) => ({ rows: r, error: null as string | null }),
    (e: unknown) => ({
      rows: [],
      error: e instanceof Error ? e.message : "発行依頼の取得に失敗しました",
    }),
  );

  return (
    <>
      <AppHeader title="発行依頼のまとめ" backHref="/" />
      <IssueRequestsClient rows={rows} error={error} />
    </>
  );
}
