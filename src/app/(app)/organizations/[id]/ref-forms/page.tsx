import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { canUseUnifiedPrep } from "@/lib/unified-prep";
import { OrgRefFormsChecklist, type OrgRefFormPerson } from "./OrgRefFormsChecklist";

export const dynamic = "force-dynamic";

// 所属機関の「参考様式の準備」（申請書類作成をアプリ一本化計画・試験中。管理者・職員）。
// どの参考様式が全員共通で、どれを所属機関がわで用意するか（PDF の登録と記入位置）を、
// この所属機関の人の国籍の言語ごとに一覧にする
export default async function OrgRefFormsPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (!canUseUnifiedPrep(me.role)) notFound();

  const { id } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name").eq("id", id).maybeSingle();
  if (!org) notFound();
  const o = org as { id: string; name: string };

  // この所属機関で働いている人と、この所属機関への申請を準備している人（国籍から言語を決める）
  const cols = "id, name, nationality, status";
  const [atOrg, preparing] = await Promise.all([
    supabase.from("workers").select(cols).eq("current_organization_id", id),
    supabase.from("workers").select(cols).eq("application_prep_organization_id", id),
  ]);
  const seen = new Set<string>();
  const people: OrgRefFormPerson[] = [];
  for (const [rows, prep] of [
    [atOrg.data, false],
    [preparing.data, true],
  ] as const) {
    for (const r of (rows as { id: string; name: string; nationality: string | null; status: string | null }[] | null) ?? []) {
      if (seen.has(r.id)) continue;
      // 退職・帰国・キャンセルの人は言語の見当に入れない
      if (["退職", "帰国", "キャンセル"].includes(r.status ?? "")) continue;
      seen.add(r.id);
      people.push({ id: r.id, name: r.name, nationality: r.nationality ?? "", preparing: prep });
    }
  }

  return (
    <>
      <AppHeader title={`${o.name}｜参考様式の準備（試験中）`} backHref={`/organizations/${o.id}`} />
      <div className="px-4 pb-10 pt-4 md:px-8">
        <OrgRefFormsChecklist orgId={o.id} orgName={o.name} people={people} />
      </div>
    </>
  );
}
