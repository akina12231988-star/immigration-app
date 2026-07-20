import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import {
  listMunicipalities,
  listJudgmentRecords,
} from "@/lib/supabase/queries/tax-cert";
import { listWorkersBrief } from "@/lib/supabase/queries/workers";
import { MailingClient } from "./MailingClient";

export const dynamic = "force-dynamic";

export default async function MailingPage({
  searchParams,
}: {
  searchParams: Promise<{ worker?: string; record?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { worker: workerParam, record: recordParam } = await searchParams;

  const supabase = await createClient();
  const [municipalities, records, workers] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listJudgmentRecords(supabase).catch(() => []),
    listWorkersBrief(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="郵送請求（課税・納税証明書）" backHref="/workers" />
      <MailingClient
        initialMunicipalities={municipalities}
        initialRecords={records}
        workers={workers.map((w) => ({ id: w.id, name: w.name }))}
        initialWorkerId={workerParam}
        focusRecordId={recordParam}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
