import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { ResumeImportClient } from "./ResumeImportClient";

export const dynamic = "force-dynamic";

// 履歴書PDF（履歴書ツール tokutei-rireki で作ったもの）の取り込み。
// PDFに埋め込まれた入力内容を読み取り、外国人を新しく登録するか、登録済みの人を更新する
export default async function ResumeImportPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/workers");

  const supabase = await createClient();
  const workers = await listWorkersWithOrg(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="履歴書PDFの取り込み" backHref="/workers" />
      <ResumeImportClient workers={workers} />
    </>
  );
}
