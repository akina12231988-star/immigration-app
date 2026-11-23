import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getQuote, listQuotes } from "@/lib/supabase/queries/quotes";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { getAppSetting } from "@/lib/supabase/queries/app-settings";
import { CUSTODIAN_SETTING_KEY, mergeCustodianInfo } from "@/lib/custody";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { todayStr } from "@/lib/ssw/calc";
import { QuoteEditor } from "./QuoteEditor";

export const dynamic = "force-dynamic";

// 見積書1通の編集・印刷と、その後のやりとりの記録
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { id } = await params;
  const supabase = await createClient();

  const quote = await getQuote(supabase, id).catch(() => null);
  if (!quote) notFound();
  const [others, organizations, custodianSetting] = await Promise.all([
    listQuotes(supabase).catch(() => []),
    listOrganizations(supabase).catch(() => []),
    getAppSetting<Record<string, unknown>>(supabase, CUSTODIAN_SETTING_KEY).catch(() => null),
  ]);

  return (
    <QuoteEditor
      initial={quote}
      copySources={others
        .filter((q) => q.id !== quote.id)
        .map((q) => ({ id: q.id, label: `${q.addressee_name}（${q.issued_on ?? "日付なし"}・${q.items.length}項目）`, items: q.items }))}
      organizations={organizations.map((o) => ({
        id: o.id,
        name: o.name,
        address: o.address ?? "",
        repName: normalizeOrganizationIntake(o.intake).rep_name,
      }))}
      custodian={mergeCustodianInfo(custodianSetting)}
      canEdit={me.role !== "viewer"}
      today={todayStr()}
    />
  );
}
