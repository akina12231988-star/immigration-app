import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { PayProofSheet } from "./PayProofSheet";
import { effectiveResidencePeriod } from "@/lib/residence-card";

export const dynamic = "force-dynamic";

// 報酬支払証明書（参考様式第５－７号）。通貨払いの会社へ渡す用紙を
// 在留期限日までの月数ぶん（1か月に1枚）まとめて印刷する
export default async function WorkerPayProofPage({
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
  if (worker.current_organization_id) {
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", worker.current_organization_id)
      .maybeSingle();
    orgName = (data as { name: string } | null)?.name ?? "";
  }

  return (
    <PayProofSheet
      orgName={orgName}
      worker={{
        name: worker.name,
        gender: worker.gender,
        birth: worker.birth,
        nationality: worker.nationality,
        residenceCardNo: worker.residence_card_no,
        residencePeriod: effectiveResidencePeriod(worker),
        residenceExpiryDate: worker.residence_expiry_date,
        // 現在の所属機関の雇用開始日（所属機関別の記録を優先）。何月分から印刷するかに使う
        employmentStartOn:
          (worker.org_employment_starts ?? []).find(
            (s) => s.organization_id === worker.current_organization_id && s.start_on,
          )?.start_on ||
          worker.employment_start_on ||
          null,
      }}
    />
  );
}
