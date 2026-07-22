import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getCustody } from "@/lib/supabase/queries/custody";
import { getWorkerLatestDocUrls } from "../../../workers/actions";
import { getCustodyImageUrls } from "../../actions";
import { ReceiptSheet } from "./ReceiptSheet";

export const dynamic = "force-dynamic";

export default async function CustodyReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const record = await getCustody(supabase, id).catch(() => null);
  if (!record || !record.workers) notFound();

  // 発行時に添付した在留カード画像（無ければ外国人管理の最新在留カード画像を表面として使う）
  const urls = await getCustodyImageUrls(record.front_image_path, record.back_image_path);
  let frontUrl = urls.frontUrl;
  const backUrl = urls.backUrl;
  if (!frontUrl) {
    const { residenceCardUrl } = await getWorkerLatestDocUrls(record.workers.id).catch(() => ({
      residenceCardUrl: "",
    }));
    frontUrl = residenceCardUrl;
  }

  return <ReceiptSheet record={record} frontUrl={frontUrl} backUrl={backUrl} />;
}
