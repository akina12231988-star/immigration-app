import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import {
  listMunicipalities,
  listJudgmentRecords,
} from "@/lib/supabase/queries/tax-cert";
import { MailingClient } from "./MailingClient";

export const dynamic = "force-dynamic";

export default async function MailingPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [municipalities, records] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listJudgmentRecords(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="郵送請求（課税・納税証明書）" backHref="/workers" />
      <MailingClient
        initialMunicipalities={municipalities}
        initialRecords={records}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
