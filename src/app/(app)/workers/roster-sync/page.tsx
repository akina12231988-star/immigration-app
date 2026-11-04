import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { RosterWorker } from "@/lib/roster-sync";
import { RosterSyncClient } from "./RosterSyncClient";

export const dynamic = "force-dynamic";

// 在籍名簿（エクセル）の「配属先」「居住について」を外国人詳細へ反映する画面
export default async function RosterSyncPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/workers");

  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("id, name, residence_card_no, assigned_office, residence_note")
    .order("name");

  return (
    <>
      <AppHeader title="在籍名簿から配属先・居住を反映" backHref="/workers" />
      <RosterSyncClient workers={(data as RosterWorker[] | null) ?? []} />
    </>
  );
}
