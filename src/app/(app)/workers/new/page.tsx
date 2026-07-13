import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { NewWorkerForm } from "./NewWorkerForm";

export const dynamic = "force-dynamic";

export default async function NewWorkerPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/workers");

  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  return (
    <>
      <AppHeader title="外国人を登録" backHref="/workers" />
      <NewWorkerForm organizations={organizations} />
    </>
  );
}
