import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { PlanDatesClient } from "./PlanDatesClient";

export const dynamic = "force-dynamic";

// 特定技能 支援計画書の日付計算（申請準備のTODOから使う）
export default async function PlanDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ workerId?: string; name?: string; org?: string; todo?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const params = await searchParams;

  return (
    <>
      <AppHeader title="支援計画書 日付計算" backHref="/workers/renewals" />
      <PlanDatesClient
        initialName={params.name ?? ""}
        initialOrg={params.org ?? ""}
        initialTodo={params.todo ?? ""}
        workerId={params.workerId ?? ""}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
