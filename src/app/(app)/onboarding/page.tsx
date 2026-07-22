import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listWorkersForOnboarding } from "@/lib/supabase/queries/workers";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ worker?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [workers, organizations] = await Promise.all([
    listWorkersForOnboarding(supabase).catch(() => []),
    listOrganizations(supabase).catch(() => []),
  ]);
  const { worker } = await searchParams;

  return (
    <>
      <AppHeader title="入社書類メール" backHref="/" />
      <OnboardingClient
        workers={workers}
        organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        initialWorkerId={worker ?? ""}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
