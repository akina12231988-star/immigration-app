import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeDependents } from "@/lib/dependents";
import { DependentsFormSheet } from "./DependentsFormSheet";

export const dynamic = "force-dynamic";

export default async function DependentsFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; year?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  // ?kind=year-end で開いたら年末調整時を選んだ状態にする（外国人詳細・年末調整の一覧のボタンから）
  const sp = await searchParams;
  const initialKind = sp.kind === "year-end" ? "年末調整時" : "入社時";
  const initialYear = /^\d{4}$/.test(sp.year ?? "") ? sp.year : undefined;
  const supabase = await createClient();
  const worker = await getWorkerWithHistories(supabase, id);
  if (!worker) notFound();

  return (
    <DependentsFormSheet
      worker={{
        name: worker.name,
        kana: worker.kana,
        birth: worker.birth,
        address: worker.address,
        myNumber: worker.my_number,
        hasSpouse: worker.has_spouse,
      }}
      dependents={normalizeDependents(worker.dependents)}
      initialKind={initialKind}
      initialYear={initialYear}
    />
  );
}
