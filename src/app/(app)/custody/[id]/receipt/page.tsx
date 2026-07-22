import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getCustody } from "@/lib/supabase/queries/custody";
import { getWorkerLatestDocUrls } from "../../../workers/actions";
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

  // 在留カードの最新画像（登録があれば預かり証に載せる）
  const { residenceCardUrl } = await getWorkerLatestDocUrls(record.workers.id).catch(() => ({
    residenceCardUrl: "",
  }));

  return <ReceiptSheet record={record} residenceCardUrl={residenceCardUrl} />;
}
