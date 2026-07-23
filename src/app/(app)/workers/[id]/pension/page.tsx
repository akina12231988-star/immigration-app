import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { PensionRecordClient } from "./PensionRecordClient";

export const dynamic = "force-dynamic";

export default async function PensionRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("workers").select("id, name").eq("id", id).maybeSingle();
  if (!data) notFound();
  const worker = data as { id: string; name: string };

  return (
    <>
      <AppHeader title="年金記録の確認" backHref={`/workers/${id}`} />
      <div className="px-4 pt-4">
        <PensionRecordClient
          workerId={worker.id}
          workerName={worker.name}
          canEdit={me.role !== "viewer"}
        />
      </div>
    </>
  );
}
