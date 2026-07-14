import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listOrientations } from "@/lib/supabase/queries/orientations";
import { OrientationsClient } from "./OrientationsClient";

export const dynamic = "force-dynamic";

export default async function OrientationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const orientations = await listOrientations(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="生活オリエンテーション" backHref="/" />
      <OrientationsClient orientations={orientations} canEdit={me.role !== "viewer"} />
    </>
  );
}
