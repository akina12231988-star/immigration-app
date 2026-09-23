import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getCurrentResidenceCard } from "../../actions";
import { ResidenceCardPrint } from "./ResidenceCardPrint";

export const dynamic = "force-dynamic";

// 現在の在留カードを印刷する（納税証明書その3の本人確認書類の写しなど）。
// 登録が無ければ、この画面で最新の在留カードを添付してから印刷する
export default async function WorkerResidenceCardPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("workers").select("id, name, messenger_link").eq("id", id).maybeSingle();
  const worker = data as { id: string; name: string; messenger_link: string | null } | null;
  if (!worker) notFound();

  const card = await getCurrentResidenceCard(id).catch(() => null);
  return (
    <ResidenceCardPrint
      workerId={worker.id}
      workerName={worker.name}
      messengerLink={worker.messenger_link ?? ""}
      card={card}
      canEdit={me.role !== "viewer"}
    />
  );
}
