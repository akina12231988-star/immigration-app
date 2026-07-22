import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listActiveStorageNos } from "@/lib/supabase/queries/custody";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { NewCustodyForm } from "./NewCustodyForm";

export const dynamic = "force-dynamic";

export default async function NewCustodyPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/custody");

  const supabase = await createClient();
  const [workers, activeNos] = await Promise.all([
    listWorkersWithOrg(supabase).catch(() => []),
    listActiveStorageNos(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="預かり証を発行" backHref="/custody" />
      <NewCustodyForm workers={workers} activeNos={activeNos} meName={me.display_name} />
    </>
  );
}
