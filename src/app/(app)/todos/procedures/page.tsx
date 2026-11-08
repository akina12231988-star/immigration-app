import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { TodosClient } from "../TodosClient";
import { ProcedureImportBanner } from "./ProcedureImportBanner";

export const dynamic = "force-dynamic";

// 住所・保険の手続きのTODO（転出手続き・転入手続き・国民健康保険の加入手続き・国民年金の加入手続き）
export default async function ProcedureTodosPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const canEdit = me.role !== "viewer";

  return (
    <>
      <AppHeader title="住所・保険の手続き" backHref="/todos" />
      {canEdit && <ProcedureImportBanner />}
      <TodosClient canEdit={canEdit} fixedKind="住所・保険の手続き" />
    </>
  );
}
