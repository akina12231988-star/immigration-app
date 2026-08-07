import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrgInvoices } from "@/lib/supabase/queries/org-invoices";
import { invoiceBilledOn, invoiceDueOn, isMonthStr } from "@/lib/monthly-billing";
import { honorificFor, type ReminderInvoiceRow } from "@/lib/reminder-letter";
import { todayStr } from "@/lib/ssw/calc";
import { ReminderSheet } from "./ReminderSheet";

export const dynamic = "force-dynamic";

// 督促状（未入金のお支払いのご確認）の印刷ページ。
// 請求書作成の機関カードから ?org=<所属機関ID>&month=<対象月> で開く。
// 請求日・支払期限は対象月から決まるので、記録の対象月だけを見て組み立てる
export default async function ReminderPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; month?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { org: orgId, month } = await searchParams;
  if (!orgId || !month || !isMonthStr(month)) notFound();

  const supabase = await createClient();
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!orgRow) notFound();
  const orgName = (orgRow as { name: string }).name;

  const invoices = await listOrgInvoices(supabase, orgId);
  const toRow = (inv: (typeof invoices)[number]): ReminderInvoiceRow => ({
    billedOn: invoiceBilledOn(inv.month),
    invoiceNo: inv.invoice_no,
    amount: inv.amount,
    paid: inv.paid,
    dueOn: invoiceDueOn(inv.month),
  });

  // 残額が残っている過去の請求＝督促の対象。今回（対象月）の請求は参考として末尾に載せる
  const unpaid = invoices
    .filter((inv) => inv.month !== month && inv.amount - inv.paid > 0)
    .map(toRow);
  const currentRow = invoices.find((inv) => inv.month === month);

  return (
    <ReminderSheet
      orgName={orgName}
      honorific={honorificFor(orgName)}
      month={month}
      issuedOn={todayStr()}
      unpaid={unpaid}
      current={currentRow ? toRow(currentRow) : null}
    />
  );
}
