import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fetchPostingLedger, fetchSeekerLedger } from "@/lib/supabase/queries/recruit-ledgers";
import {
  auditPairs,
  filterFeeLedger,
  filterPostingLedger,
  filterSeekerLedger,
  listNoLabel,
  type AuditTarget,
} from "@/lib/recruit-ledger-filter";
import { buildFeeLedgerSheet, postingLedgerTable, seekerLedgerTable } from "@/lib/recruit-ledgers";
import { listReferralFees } from "@/lib/supabase/queries/referrals";
import { todayStr } from "@/lib/application-alerts";
import { ledgerCell as cell } from "@/components/ledgers/LedgerSheet";
import { LedgerPrintView } from "./LedgerPrintView";

export const dynamic = "force-dynamic";

// 「リストNo.|求人ID|求職者名」の形で渡ってくる点検対象を読み取る
function parseTargets(raw: string | string[] | undefined): AuditTarget[] {
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const out: AuditTarget[] = [];
  for (const item of list) {
    const [no = "", postingId = "", workerName = ""] = item.split("|");
    if (!postingId) continue;
    out.push({ listNo: Number(no) || 0, postingId, workerName });
  }
  return out;
}

// 訪問指導の当日点検で出す求人管理簿・求職管理簿の印刷用（A4横）。
// 様式30の画面の「訪問指導の当日点検」から、選んだリストNo.を渡して開く
export default async function AuditLedgerPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[]; date?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const params = await searchParams;
  const targets = parseTargets(params.t);
  const baseDate = params.date || todayStr();

  const supabase = await createClient();
  const [postings, seekers, fees] = await Promise.all([
    fetchPostingLedger(supabase).catch(() => []),
    fetchSeekerLedger(supabase).catch(() => []),
    listReferralFees(supabase).catch(() => []),
  ]);

  const pairs = auditPairs(postings, targets);
  const postingEntries = filterPostingLedger(postings, targets);
  const seekerEntries = filterSeekerLedger(seekers, pairs);

  // 労働局に出す分なので、社内の覚え書きが入る「備考」は出さない
  const posting = postingLedgerTable(postingEntries, { omitNote: true });
  const seeker = seekerLedgerTable(seekerEntries, { omitNote: true });

  // 手数料管理簿は様式の並びが Excel と同じなので、そのシートの中身をそのまま表にする
  const feeSheet = buildFeeLedgerSheet(
    filterFeeLedger(fees, pairs).map((f) => ({
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
    <LedgerPrintView
      listNos={listNoLabel(targets.map((t) => t.listNo).filter(Boolean))}
      baseDate={baseDate}
      posting={{ header: posting.header, rows: posting.rows.map((r) => r.map(cell)) }}
      seeker={{ header: seeker.header, rows: seeker.rows.map((r) => r.map(cell)) }}
      fee={{
        header: (feeSheet.rows[1] ?? []).map(cell),
        rows: feeSheet.rows.slice(2).map((r) => r.map(cell)),
      }}
    />
  );
}
