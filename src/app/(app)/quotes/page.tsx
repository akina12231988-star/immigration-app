import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listQuotes } from "@/lib/supabase/queries/quotes";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { dbErrorMessage } from "@/lib/errors";
import { QUOTE_MIGRATION } from "@/lib/quote";
import { todayStr } from "@/lib/ssw/calc";
import { QuotesClient, type QuoteOrgOption } from "./QuotesClient";

export const dynamic = "force-dynamic";

// 見積書（新規のお客様向けの料金の一覧）。発行した見積書と、その後のやりとりを記録する。
//   ?org=所属機関ID … その会社の見積書に絞り、新しい見積書の宛先をその会社にして開く
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { org } = await searchParams;

  const supabase = await createClient();
  const [loaded, organizations] = await Promise.all([
    listQuotes(supabase).then(
      (rows) => ({ rows, error: null as string | null }),
      (err: unknown) => ({ rows: [], error: dbErrorMessage(err, QUOTE_MIGRATION, "見積書の読み込みに失敗しました") }),
    ),
    listOrganizations(supabase).catch(() => []),
  ]);
  const orgOptions: QuoteOrgOption[] = organizations.map((o) => {
    const intake = normalizeOrganizationIntake(o.intake);
    return { id: o.id, name: o.name, address: o.address ?? "", repName: intake.rep_name, supportFee: intake.support_fee };
  });

  return (
    <>
      <AppHeader title="見積書（新規のお客様）" backHref="/" />
      <QuotesClient
        initialQuotes={loaded.rows}
        loadError={loaded.error}
        organizations={orgOptions}
        initialOrgId={org && orgOptions.some((o) => o.id === org) ? org : ""}
        canEdit={me.role !== "viewer"}
        today={todayStr()}
      />
    </>
  );
}
