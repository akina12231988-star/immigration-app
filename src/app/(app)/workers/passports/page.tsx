import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { PassportsClient } from "./PassportsClient";

export const dynamic = "force-dynamic";

export default async function PassportsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const workers = await listWorkersWithOrg(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="パスポート更新必要" backHref="/" />
      <PassportsClient workers={workers} />
    </>
  );
}
