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
  // q: 記録一覧を開いて氏名・TODO番号で絞り込む（申請準備のTODOの「郵送請求を開く」から）
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { q } = await searchParams;

  const supabase = await createClient();
  const [municipalities, records, workers] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listJudgmentRecords(supabase).catch(() => []),
    listWorkersBrief(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="郵送請求（課税・納税証明書／転出届／住民票）" backHref="/workers" />
      <MailingClient
        initialMunicipalities={municipalities}
        initialRecords={records}
        workers={workers.map((w) => ({ id: w.id, name: w.name, address: w.address }))}
        canEdit={me.role !== "viewer"}
        initialKeyword={q ?? ""}
      />
    </>
  );
}
