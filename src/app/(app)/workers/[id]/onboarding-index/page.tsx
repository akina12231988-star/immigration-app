import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { onboardingIndexItems } from "@/lib/onboarding-index";
import { todayStr } from "@/lib/ssw/calc";
import { OnboardingIndexSheet } from "./OnboardingIndexSheet";

export const dynamic = "force-dynamic";

// 入社書類の目次（A4縦）。所属機関に紙で資料を渡すとき、資料の束の1枚目に付ける。
// 書類の並びは入社書類メールと同じで、会社の条件（扶養控除等申告書を渡す会社か、
// 雇用保険の適用事業所か、通貨払いか）で足し引きする
export default async function WorkerOnboardingIndexPage({
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

  let orgName = "";
  let payMethod = "";
  let koyoCovered = "";
  let handoverMethod = "";
  if (worker.current_organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("name, intake")
      .eq("id", worker.current_organization_id)
      .maybeSingle();
    const org = data as { name: string; intake: unknown } | null;
    if (org) {
      const intake = normalizeOrganizationIntake(org.intake);
      orgName = org.name;
      payMethod = intake.pay_method;
      koyoCovered = intake.koyo_covered;
      handoverMethod = intake.handover_method;
    }
  }

  const today = todayStr();
  return (
    <OnboardingIndexSheet
      workerId={worker.id}
      workerName={worker.name}
      workerKana={worker.kana}
      orgName={orgName}
      handoverMethod={handoverMethod}
      today={today}
      items={onboardingIndexItems({ today, orgName, payMethod, koyoCovered })}
    />
  );
}
