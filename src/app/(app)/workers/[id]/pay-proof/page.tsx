import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { PayProofSheet } from "./PayProofSheet";

export const dynamic = "force-dynamic";

// 報酬支払証明書（参考様式第５－７号）。通貨払いの会社へ渡す用紙を
// 在留期間のぶん（6枚または12枚）まとめて印刷する
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
        residencePeriod: worker.residence_period,
        residenceExpiryDate: worker.residence_expiry_date,
      }}
    />
  );
}
