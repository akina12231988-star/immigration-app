import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { HealthCheckDetailClient } from "./HealthCheckDetailClient";

export const dynamic = "force-dynamic";

export default async function HealthCheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("id, name, health_check_on")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const worker = data as { id: string; name: string; health_check_on: string | null };

  return (
    <>
      <AppHeader title="健康診断書の詳細" backHref={`/workers/${id}`} />
      <div className="px-4 pt-4">
        <HealthCheckDetailClient
          workerId={worker.id}
          workerName={worker.name}
          examOn={worker.health_check_on ?? null}
          canEdit={me.role !== "viewer"}
        />
      </div>
    </>
  );
}
