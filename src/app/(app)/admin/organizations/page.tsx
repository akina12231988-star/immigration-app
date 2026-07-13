import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { OrganizationsAdmin } from "./OrganizationsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const supabase = await createClient();
  const organizations = await listOrganizations(supabase);

  return (
    <>
      <AppHeader title="会社・機関マスタ" backHref="/" />
      <OrganizationsAdmin organizations={organizations} />
    </>
  );
}
