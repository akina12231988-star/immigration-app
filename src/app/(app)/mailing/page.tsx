import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import {
  listMunicipalities,
  listJudgmentRecords,
} from "@/lib/supabase/queries/tax-cert";
import { listTaxOffices } from "@/lib/supabase/queries/tax-office";
import { MailingClient } from "./MailingClient";
import { listMailingWorkers } from "./workers";

export const dynamic = "force-dynamic";

export default async function MailingPage({
  searchParams,
}: {
  // q: 記録一覧を開いて氏名・TODO番号で絞り込む（申請準備のTODOの「郵送請求を開く」から）
  // focus: 記録の詳細から戻ったとき、その記録の行を目立たせる
  // worker・todo・kind: 申請準備の行から、その人・そのTODO・その書類を選んだ状態で請求フォームを開く
  searchParams: Promise<{ q?: string; focus?: string; tab?: string; worker?: string; todo?: string; kind?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { q, focus, tab, worker, todo, kind } = await searchParams;

  const supabase = await createClient();
  const [municipalities, records, workers, taxOffices] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listJudgmentRecords(supabase).catch(() => []),
    listMailingWorkers(supabase).catch(() => []),
    // 税務署マスタ（0148 未適用なら空のまま。画面で案内する）
    listTaxOffices(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="証明書類の請求（課税・納税証明書／転出届／住民票／納税証明書その3／年金記録）" backHref="/workers" />
      <MailingClient
        initialMunicipalities={municipalities}
        initialRecords={records}
        initialTaxOffices={taxOffices}
        workers={workers.map((w) => ({
          id: w.id,
          name: w.name,
          address: w.address ?? "",
          kana: w.kana ?? "",
          my_number: w.my_number ?? "",
        }))}
        canEdit={me.role !== "viewer"}
        initialKeyword={q ?? ""}
        focusId={focus ?? ""}
        openRecords={tab === "records"}
        prefill={worker ? { workerId: worker, todoNumber: todo ?? "", kind: kind ?? "" } : undefined}
      />
    </>
  );
}
