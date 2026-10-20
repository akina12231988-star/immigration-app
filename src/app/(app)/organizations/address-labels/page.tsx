import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listWorkersForSupport } from "@/lib/supabase/queries/workers";
import { summarizeOrganizations } from "@/lib/support-system";
import { todayStr } from "@/lib/application-alerts";
import { AddressLabelsClient } from "./AddressLabelsClient";

export const dynamic = "force-dynamic";

// 所属機関の住所印刷。会社名と住所をテープ（ラベルプリンター）に貼るテキストにしてコピーしたり、
// 複数の機関を選んで CSV にしたりする（ラベルソフトのデータベース機能に読み込ませる）
export default async function OrganizationAddressLabelsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [organizations, workers] = await Promise.all([listOrganizations(supabase), listWorkersForSupport(supabase)]);
  const summary = summarizeOrganizations(organizations, workers);
  // 在籍中の人数（支援対象かどうかに関わらず、この機関に紐づく在籍中の人）
  const activeCounts: Record<string, number> = {};
  for (const w of workers) {
    if (w.current_organization_id && w.status === "在籍中") {
      activeCounts[w.current_organization_id] = (activeCounts[w.current_organization_id] ?? 0) + 1;
    }
  }

  return (
    <>
      <AppHeader title="所属機関の住所印刷" backHref="/organizations" />
      <AddressLabelsClient
        organizations={organizations.map((o) => {
          const s = summary.find((x) => x.organizationId === o.id);
          return {
            id: o.id,
            name: o.name,
            address: o.address,
            postal: o.postal_code ?? "",
            contractStatus: s?.contractStatus ?? "",
            supportedCount: s?.workerCount ?? 0,
            activeCount: activeCounts[o.id] ?? 0,
          };
        })}
        today={todayStr()}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
