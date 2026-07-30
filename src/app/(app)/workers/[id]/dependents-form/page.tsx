import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeDependents } from "@/lib/dependents";
import { DependentsFormSheet } from "./DependentsFormSheet";

export const dynamic = "force-dynamic";

export default async function DependentsFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const worker = await getWorkerWithHistories(supabase, id);
  if (!worker) notFound();

  // 給与の支払者 = 現在の所属機関（名称・法人番号・所在地）
  let org = { name: "", corporate_no: "", address: "" };
  if (worker.current_organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("name, corporate_no, address")
      .eq("id", worker.current_organization_id)
      .maybeSingle();
    if (data) org = data as typeof org;
  }

  return (
    <DependentsFormSheet
      org={org}
      worker={{
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth,
        address: worker.address,
        myNumber: worker.my_number,
        hasSpouse: worker.has_spouse,
      }}
      dependents={normalizeDependents(worker.dependents)}
    />
  );
}
