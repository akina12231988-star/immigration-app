import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { getWorkerPhotoUrl, getWorkerLatestDocUrls } from "../actions";
import { PrintClient, type PrintWorker } from "./PrintClient";
import type { Worker } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function WorkersPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    worker?: string;
    from?: string;
    to?: string;
    mode?: string;
  }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { org, worker: workerParam, from, to, mode } = await searchParams;
  const forCompany = mode === "company"; // 会社提出用（MessengerのQRを消す）
  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  let workers: Worker[] = [];
  if (workerParam) {
    // 個人単位の印刷
    const { data } = await supabase.from("workers").select("*").eq("id", workerParam).maybeSingle();
    if (data) workers = [data as Worker];
  } else if (org) {
    // 所属機関 AND 在留許可日の期間で絞り込み
    let q = supabase.from("workers").select("*").eq("current_organization_id", org);
    if (from) q = q.gte("residence_permit_date", from);
    if (to) q = q.lte("residence_permit_date", to);
    const { data } = await q.order("name");
    workers = (data as Worker[]) ?? [];
  }

  // 各外国人の顔写真・最新書類の署名付きURLをまとめて取得
  const printWorkers: PrintWorker[] = await Promise.all(
    workers.map(async (w) => {
      const [photoUrl, docs] = await Promise.all([
        getWorkerPhotoUrl(w.photo_path),
        getWorkerLatestDocUrls(w.id),
      ]);
      const orgId = w.current_organization_id;
      return {
        id: w.id,
        name: w.name,
        kana: w.kana,
        nationality: w.nationality,
        birth: w.birth,
        residenceCardNo: w.residence_card_no,
        field: w.field,
        specialtyGrade: w.specialty_grade,
        otherQualifications: w.other_qualifications,
        residenceStatus: w.residence_status,
        residencePermitDate: w.residence_permit_date,
        residenceExpiryDate: w.residence_expiry_date,
        messengerLink: w.messenger_link,
        orgName: orgId ? (organizations.find((o) => o.id === orgId)?.name ?? "") : "",
        photoUrl,
        residenceCardUrl: docs.residenceCardUrl,
        designationUrl: docs.designationUrl,
      };
    }),
  );

  const orgName = organizations.find((o) => o.id === org)?.name ?? "";

  return (
    <PrintClient
      organizations={organizations}
      selectedOrg={org ?? ""}
      orgName={orgName}
      individual={Boolean(workerParam)}
      from={from ?? ""}
      to={to ?? ""}
      forCompany={forCompany}
      workers={printWorkers}
    />
  );
}
