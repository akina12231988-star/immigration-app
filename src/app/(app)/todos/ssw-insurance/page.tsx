import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { SswInsuranceClient } from "./SswInsuranceClient";

export const dynamic = "force-dynamic";

// 特定技能総合保険（TODOの中の1画面）。
// 未加入・期限切れの人を仕分けして、加入手続き・解約手続きのTODOを作り、
// 加入したら被保険者証明書を貼り付けて番号・有効期限を記録する。
export default async function SswInsurancePage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="特定技能総合保険" backHref="/todos" />
      <SswInsuranceClient canEdit={me.role !== "viewer"} />
    </>
  );
}
