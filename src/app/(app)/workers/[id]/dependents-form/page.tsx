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
    />
  );
}
