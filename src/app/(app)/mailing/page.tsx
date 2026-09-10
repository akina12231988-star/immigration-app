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

// 郵送請求ツールで使う外国人の項目（現在の住所は請求先判断、フリガナ・個人番号は納税証明書の請求書の自動入力に使う）
interface MailingWorkerRow {
  id: string;
  name: string;
  address: string | null;
  kana: string | null;
  my_number: string | null;
}

async function listMailingWorkers(supabase: Awaited<ReturnType<typeof createClient>>): Promise<MailingWorkerRow[]> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, address, kana, my_number")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as MailingWorkerRow[]) ?? [];
}

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
  const [municipalities, records, workers, taxOffices] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listJudgmentRecords(supabase).catch(() => []),
    listMailingWorkers(supabase).catch(() => []),
    // 税務署マスタ（0148 未適用なら空のまま。画面で案内する）
    listTaxOffices(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="郵送請求（課税・納税証明書／転出届／住民票／納税証明書その3）" backHref="/workers" />
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
      />
    </>
  );
}
