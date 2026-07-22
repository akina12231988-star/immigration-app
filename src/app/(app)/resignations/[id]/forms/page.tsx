import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getResignationForForms } from "@/lib/supabase/queries/resignations";
import { ResignationForms } from "./ResignationForms";

export const dynamic = "force-dynamic";

export default async function ResignationFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const resignation = await getResignationForForms(supabase, id);
  if (!resignation || !resignation.workers) notFound();

  const w = resignation.workers;
  return (
    <ResignationForms
      resignation={{
        id: resignation.id,
        kind: resignation.kind,
        reason: resignation.reason,
        leavingOn: resignation.leaving_on,
        todoNo: resignation.todo_no,
        orgName: resignation.org_name,
        orgAddress: resignation.org_address,
        orgContact: resignation.org_contact,
        businessCategory: resignation.organizations?.business_category ?? "",
      }}
      worker={{
        name: w.name,
        kana: w.kana,
        gender: w.gender,
        birth: w.birth,
        nationality: w.nationality,
        address: w.address,
        residenceCardNo: w.residence_card_no,
        field: w.field,
      }}
    />
  );
}
