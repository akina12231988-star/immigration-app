import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function WorkersImportPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/workers");

  return (
    <>
      <AppHeader title="旧データの取り込み" backHref="/workers" />
      <ImportClient />
    </>
  );
}
