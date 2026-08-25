import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listReferralFees } from "@/lib/supabase/queries/referrals";
import { buildFeeLedgerSheet } from "@/lib/recruit-ledgers";
import { ledgerCell as cell } from "@/components/ledgers/LedgerSheet";
import { todayStr } from "@/lib/application-alerts";
import { FeeLedgerPrintView } from "./FeeLedgerPrintView";

export const dynamic = "force-dynamic";

// 訪問指導（監査）で出す手数料管理簿の印刷用（A4横）。
// 紹介手数料台帳の「選んだ分を印刷」から、台帳の行のidを渡して開く
export default async function FeeLedgerPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; date?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const params = await searchParams;
  const raw = params.ids === undefined ? [] : Array.isArray(params.ids) ? params.ids : [params.ids];
  const ids = new Set(raw.flatMap((v) => v.split(",")).filter(Boolean));
  const baseDate = params.date || todayStr();

  const supabase = await createClient();
  const fees = await listReferralFees(supabase).catch(() => []);
  // idを渡さずに開いたときは、台帳に載っている分をそのまま出す
  const picked = ids.size > 0;
  const rows = picked ? fees.filter((f) => ids.has(f.id)) : fees;

  const sheet = buildFeeLedgerSheet(
    rows.map((f) => ({
      payer_name: f.employer_name || f.organizations?.name || "",
      paid_on: f.paid_on,
      fee_kind: f.fee_kind || "紹介手数料",
      fee: f.fee,
      calc_basis: f.calc_basis ?? "",
      worker_name: f.workers?.name ?? f.worker_name,
      note: f.note,
    })),
  );

  return (
    <FeeLedgerPrintView
      table={{
        header: (sheet.rows[1] ?? []).map(cell),
        rows: sheet.rows.slice(2).map((r) => r.map(cell)),
      }}
      baseDate={baseDate}
      names={rows.map((f) => f.workers?.name ?? f.worker_name).filter(Boolean)}
      picked={picked}
    />
  );
}
