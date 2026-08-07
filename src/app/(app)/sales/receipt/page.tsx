import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrgInvoices } from "@/lib/supabase/queries/org-invoices";
import { isMonthStr } from "@/lib/monthly-billing";
import { honorificFor } from "@/lib/reminder-letter";
import { ReceiptSheet } from "./ReceiptSheet";

export const dynamic = "force-dynamic";

// 領収書の印刷ページ。請求・入金の記録の行から
// ?org=<所属機関ID>&month=<対象月> で開く。
// 入金日が入っている記録だけ発行できる（入金に対する領収書のため）
export default async function SalesReceiptPage({
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
  const invoice = invoices.find((inv) => inv.month === month);
  if (!invoice || !invoice.paid_on || invoice.paid <= 0) notFound();

  return (
    <ReceiptSheet
      orgName={orgName}
      honorific={honorificFor(orgName)}
      month={month}
      invoiceNo={invoice.invoice_no}
      amount={invoice.paid}
      paidOn={invoice.paid_on}
      invoiceAmountExcl={invoice.amount_excl}
      invoiceTax={invoice.tax}
      invoiceAmount={invoice.amount}
    />
  );
}
