import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { SalesClient } from "./SalesClient";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="売上登録（freee販売）" />
      <SalesClient canEdit={me.role !== "viewer"} />
    </>
  );
}
