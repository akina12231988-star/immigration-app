import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeDependents } from "@/lib/dependents";
import { getDocumentRequest } from "@/lib/supabase/queries/org-document-requests";
import { DependentsFormSheet } from "./DependentsFormSheet";

export const dynamic = "force-dynamic";

export default async function DependentsFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; year?: string; request?: string; item?: string }>;
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
  // ?request=…&item=… で開いたら、会社からの書類の依頼のマスに作った申告書を添付できる
  let attachTarget: { requestId: string; itemId: string; requestTitle: string; itemName: string } | undefined;
  if (sp.request && sp.item && me.role !== "viewer") {
    const req = await getDocumentRequest(supabase, sp.request).catch(() => null);
    const item = req?.items.find((i) => i.id === sp.item);
    if (req && item) attachTarget = { requestId: req.id, itemId: item.id, requestTitle: req.title, itemName: item.name };
  }

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
      workerId={worker.id}
      attachTarget={attachTarget}
    />
  );
}
