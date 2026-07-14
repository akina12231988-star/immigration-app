import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { NewPostingForm } from "./NewPostingForm";

export const dynamic = "force-dynamic";

export default async function NewPostingPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/postings");

  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  return (
    <>
      <AppHeader title="求人を登録" backHref="/postings" />
      <NewPostingForm organizations={organizations} />
    </>
  );
}
