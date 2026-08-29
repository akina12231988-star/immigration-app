import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { listPassportRenewalGuides } from "@/lib/supabase/queries/passport-renewals";
import { PassportsClient } from "./PassportsClient";

export const dynamic = "force-dynamic";

export default async function PassportsPage() {
  // ログイン確認とデータ取得を並列に行い、ページ表示までの待ち時間を短縮する
  const supabase = await createClient();
  const [me, workers, guides] = await Promise.all([
    getMyProfile(),
    listWorkersWithOrg(supabase).catch(() => []),
    // 0126未適用のときは空のまま（全員「未案内」表示で動く）
    listPassportRenewalGuides(supabase).catch(() => []),
  ]);
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="パスポート更新必要" backHref="/" />
      <PassportsClient workers={workers} guides={guides} />
    </>
  );
}
