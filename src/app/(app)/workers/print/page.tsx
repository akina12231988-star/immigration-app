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
  searchParams: Promise<{ org?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { org } = await searchParams;
  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  let workers: Worker[] = [];
  if (org) {
    const { data } = await supabase
      .from("workers")
      .select("*")
      .eq("current_organization_id", org)
      .order("name");
    workers = (data as Worker[]) ?? [];
  }

  // 各外国人の顔写真・最新書類の署名付きURLをまとめて取得
  const printWorkers: PrintWorker[] = await Promise.all(
    workers.map(async (w) => {
      const [photoUrl, docs] = await Promise.all([
        getWorkerPhotoUrl(w.photo_path),
        getWorkerLatestDocUrls(w.id),
      ]);
      return {
        id: w.id,
        name: w.name,
        kana: w.kana,
        nationality: w.nationality,
        birth: w.birth,
        residenceCardNo: w.residence_card_no,
        field: w.field,
        residenceStatus: w.residence_status,
        residencePermitDate: w.residence_permit_date,
        residenceExpiryDate: w.residence_expiry_date,
        messengerLink: w.messenger_link,
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
      workers={printWorkers}
    />
  );
}
