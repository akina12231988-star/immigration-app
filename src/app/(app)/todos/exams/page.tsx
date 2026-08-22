import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { TodosClient } from "../TodosClient";

export const dynamic = "force-dynamic";

// 試験の申込のTODO（3つの構成のうち「試験の申込」だけの画面）
export default async function ExamTodosPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="試験の申込" backHref="/" />
      <TodosClient canEdit={me.role !== "viewer"} fixedKind="試験の申込" />
    </>
  );
}
