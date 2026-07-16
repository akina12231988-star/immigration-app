import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { RenewalsClient } from "./RenewalsClient";

export const dynamic = "force-dynamic";

export default async function RenewalsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const workers = await listWorkersWithOrg(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="在留更新対象" backHref="/" />
      <RenewalsClient workers={workers} canEdit={me.role !== "viewer"} />
    </>
  );
}
