import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { canUseUnifiedPrep } from "@/lib/unified-prep";
import { isRefFormKey, refFormName } from "@/lib/ref-form";
import { SUBMISSION_ITEMS, canAttachToSubmissionRow, canonicalSubmissionKey } from "@/lib/submission-list";
import { RefFormBatchCreator, type BatchForm } from "@/components/ref-forms/RefFormBatchCreator";

export const dynamic = "force-dynamic";

// 参考様式をまとめて確認する画面（申請書類作成をアプリ一本化計画・試験中。管理者だけ）。
// 提出書類一覧表で「有」の参考様式を1つの画面にタブで並べ、在留カードを見ながら順に確かめ・入力し、行ごとに添付する
export default async function RefFormsBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rows?: string; todo?: string; fee?: string }>;
}) {
  const { id } = await params;
  const { rows, todo, fee } = await searchParams;
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (!canUseUnifiedPrep(me.role)) notFound();

  // 行のキー（2号の行もそのまま）。様式は1号のキーで引く。本人に署名してもらうだけの書類（guidance など）はキーそのまま
  const forms: BatchForm[] = [];
  for (const row of (rows ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const key = canonicalSubmissionKey(row);
    if (!isRefFormKey(key) || forms.some((f) => f.rowKey === row)) continue;
    const item = SUBMISSION_ITEMS.find((i) => i.key === row);
    forms.push({
      rowKey: row,
      formKey: key,
      name: refFormName(key),
      label: item ? `${item.no}${item.sub ?? ""} ${item.label}` : refFormName(key),
      attachRowKey: item && canAttachToSubmissionRow(row) ? row : null,
    });
  }
  if (forms.length === 0) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("id, name, nationality, gender, application_prep_organization_id, current_organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const w = data as {
    id: string;
    name: string;
    nationality: string | null;
    gender: string | null;
    application_prep_organization_id: string | null;
    current_organization_id: string | null;
  };
  const orgId = w.application_prep_organization_id || w.current_organization_id || null;
  let orgName = "";
  if (orgId) {
    const { data: o } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    orgName = (o as { name: string } | null)?.name ?? "";
  }

  return (
    <>
      <AppHeader
        title={`${w.name}｜参考様式をまとめて確認・作成（試験中）`}
        backHref={`/workers/${w.id}/application-prep/unified`}
      />
      <div className="px-4 pb-10 pt-4 md:px-8">
        <RefFormBatchCreator
          workerId={w.id}
          forms={forms}
          todoNo={todo ?? ""}
          fee={(fee ?? "").replace(/[^0-9]/g, "")}
          nationality={w.nationality ?? ""}
          gender={w.gender ?? ""}
          orgId={orgId}
          orgName={orgName}
        />
      </div>
    </>
  );
}
