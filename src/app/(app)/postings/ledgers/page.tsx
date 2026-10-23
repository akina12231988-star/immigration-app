import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { fetchPostingLedger, fetchSeekerLedger } from "@/lib/supabase/queries/recruit-ledgers";
import { listReferralFees } from "@/lib/supabase/queries/referrals";
import { buildFeeLedgerSheet, postingLedgerTable, seekerLedgerTable } from "@/lib/recruit-ledgers";
import { todayStr } from "@/lib/application-alerts";
import { ledgerCell as cell } from "@/components/ledgers/LedgerSheet";
import { LEDGER_TITLES, LedgerPrintView, type LedgerKind } from "../audit/ledger/LedgerPrintView";

export const dynamic = "force-dynamic";

// 求人管理簿・求職管理簿・手数料管理簿の全件を一覧で見て、そのまま印刷する画面（A4横）。
// 求人管理簿の画面の「◯◯を見る・印刷」から開く。
//   ?kind=posting|seeker|fee … どの帳簿を出すか（無ければ3つとも）
//   ?note=1                 … 求人・求職管理簿の備考の欄も出す（ふだんは労働局に出す形で備考なし）
export default async function LedgersPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; note?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const params = await searchParams;
  const kind = (["posting", "seeker", "fee"] as const).find((k) => k === params.kind) as LedgerKind | undefined;
  const withNote = params.note === "1";
  const baseDate = todayStr();

  const supabase = await createClient();
  const [postings, seekers, fees] = await Promise.all([
    fetchPostingLedger(supabase).catch(() => []),
    fetchSeekerLedger(supabase).catch(() => []),
    listReferralFees(supabase).catch(() => []),
  ]);

  const posting = postingLedgerTable(postings, { omitNote: !withNote });
  const seeker = seekerLedgerTable(seekers, { omitNote: !withNote });
  const feeSheet = buildFeeLedgerSheet(
    fees.map((f) => ({
      payer_name: f.employer_name || f.organizations?.name || "",
      paid_on: f.paid_on,
      fee_kind: f.fee_kind || "紹介手数料",
      fee: f.fee,
      note: f.note,
      billed_on: f.billed_on,
    })),
  );

  const title = kind ? LEDGER_TITLES[kind] : "求人管理簿・求職管理簿・手数料管理簿";
  const count = kind === "posting" ? posting.rows.length : kind === "seeker" ? seeker.rows.length : kind === "fee" ? fees.length : null;
  const toggleHref = `/postings/ledgers?${kind ? `kind=${kind}&` : ""}note=${withNote ? "0" : "1"}`;
  const linkCls = "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-brand";

  return (
    <LedgerPrintView
      listNos=""
      baseDate={baseDate}
      only={kind}
      heading={`${title}（全件・A4横で印刷）`}
      backHref="/postings"
      lead={`${title}の全件${count != null ? `（${count}行）` : ""}を、当日点検の印刷と同じ様式で並べています${withNote ? "（備考の欄も出しています）" : "（求人・求職管理簿の備考の欄は出していません）"}。`}
      extraActions={
        <>
          {kind !== "fee" && (
            <Link href={toggleHref} className={linkCls}>
              {withNote ? "備考を出さない（労働局に出す形）" : "備考も出す（社内用）"}
            </Link>
          )}
          {(["posting", "seeker", "fee"] as const)
            .filter((k) => k !== kind)
            .map((k) => (
              <Link key={k} href={`/postings/ledgers?kind=${k}${withNote ? "&note=1" : ""}`} className={linkCls}>
                {LEDGER_TITLES[k]}へ
              </Link>
            ))}
        </>
      }
      posting={{ header: posting.header, rows: posting.rows.map((r) => r.map(cell)) }}
      seeker={{ header: seeker.header, rows: seeker.rows.map((r) => r.map(cell)) }}
      fee={{
        header: (feeSheet.rows[1] ?? []).map(cell),
        rows: feeSheet.rows.slice(2).map((r) => r.map(cell)),
      }}
    />
  );
}
