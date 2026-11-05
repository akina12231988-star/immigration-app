import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getJudgmentRecord, listMunicipalities } from "@/lib/supabase/queries/tax-cert";
import { listTaxOffices } from "@/lib/supabase/queries/tax-office";
import { listMailingWorkers } from "../../workers";
import { MailingRecordDetail } from "./MailingRecordDetail";

export const dynamic = "force-dynamic";

// 証明書類の請求の記録1件の詳細。進捗（準備中 → 代理人の発行待ち／郵送待ち → 完了）を進め、
// 送った書類・届いた証明書・領収書を添付し、申請書に書く本人の情報をコピーできる。
// 請求フォームで記録したあと・申請準備の課税証明書などの行からここを開く
export default async function MailingRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // other: 国保税の納税証明書を別の記録に分けて保存したとき、もう一方の記録
  searchParams: Promise<{ saved?: string; other?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { id } = await params;
  const { saved, other } = await searchParams;

  const supabase = await createClient();
  const record = await getJudgmentRecord(supabase, id).catch(() => null);
  if (!record) notFound();
  const [municipalities, taxOffices, workers] = await Promise.all([
    listMunicipalities(supabase).catch(() => []),
    listTaxOffices(supabase).catch(() => []),
    listMailingWorkers(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="証明書類の請求の記録" backHref={`/mailing?focus=${record.id}`} />
      <MailingRecordDetail
        record={record}
        municipalities={municipalities}
        taxOffices={taxOffices}
        workers={workers.map((w) => ({ id: w.id, name: w.name, address: w.address ?? "", kana: w.kana ?? "", my_number: w.my_number ?? "" }))}
        canEdit={me.role !== "viewer"}
        justSaved={saved === "1"}
        otherId={other ?? ""}
      />
    </>
  );
}
