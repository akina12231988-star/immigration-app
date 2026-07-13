import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { getWorkerWithHistories } from "@/lib/supabase/queries/workers";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { WorkerDetail } from "./WorkerDetail";

export const dynamic = "force-dynamic";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const [worker, organizations] = await Promise.all([
    getWorkerWithHistories(supabase, id),
    listOrganizations(supabase),
  ]);
  if (!worker) notFound();

  return (
    <>
      <AppHeader title="外国人詳細" backHref="/workers" />
      <WorkerDetail
        worker={worker}
        organizations={organizations}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
