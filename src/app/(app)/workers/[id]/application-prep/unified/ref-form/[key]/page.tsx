import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { canUseUnifiedPrep } from "@/lib/unified-prep";
import { REF_FORM_ITEMS, refFormName } from "@/lib/ref-form";
import { RefFormCreator } from "@/components/ref-forms/RefFormCreator";

export const dynamic = "force-dynamic";

// 参考様式の作成画面（申請書類作成をアプリ一本化計画・試験中。管理者だけ）。
// 記入位置を元に、この人の分を見ながら自由な文字を入れ、○を動かし、印刷・PDFで保存・一時保存する
export default async function RefFormCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; key: string }>;
  searchParams: Promise<{ todo?: string }>;
}) {
  const { id, key } = await params;
  const { todo } = await searchParams;
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (!canUseUnifiedPrep(me.role)) notFound();
  if (!REF_FORM_ITEMS.some((i) => i.key === key)) notFound();

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
        title={`${w.name}｜${refFormName(key)}を作成（試験中）`}
        backHref={`/workers/${w.id}/application-prep/unified`}
      />
      <div className="px-4 pb-10 pt-4 md:px-8">
        <RefFormCreator
          workerId={w.id}
          formKey={key}
          todoNo={todo ?? ""}
          nationality={w.nationality ?? ""}
          gender={w.gender ?? ""}
          orgId={orgId}
          orgName={orgName}
        />
      </div>
    </>
  );
}
