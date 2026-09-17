import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listFollowupRequests, listIssueRequests } from "@/lib/supabase/queries/issue-requests";
import { todayStr } from "@/lib/application-alerts";
import { errorMessage } from "@/lib/errors";
import { IssueRequestsClient } from "./IssueRequestsClient";

export const dynamic = "force-dynamic";

export default async function IssueRequestsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  // 取得に失敗しても画面は開けるようにし、失敗した事実だけ出す（0件と紛らわしくしない）
  const [docs, followups] = await Promise.all([
    listIssueRequests(supabase).then(
      (r) => ({ rows: r, error: null as string | null }),
      // Supabase のエラーは Error ではない素のオブジェクトなので、中身の message を取り出す
      (e: unknown) => ({
        rows: [],
        error: errorMessage(e, "発行依頼の取得に失敗しました"),
      }),
    ),
    // 転居手続き・国保加入の依頼（0119 未適用なら空にして、書類の分だけ出す）
    listFollowupRequests(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="依頼中（発行依頼・手続きの依頼）" backHref="/" />
      <IssueRequestsClient rows={[...docs.rows, ...followups]} error={docs.error} today={todayStr()} />
    </>
  );
}
