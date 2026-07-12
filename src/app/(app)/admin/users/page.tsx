import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { Profile } from "@/types/db";
import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <>
      <AppHeader title="職員・権限管理" backHref="/" />
      <UsersAdmin profiles={(data as Profile[]) ?? []} myId={me.id} />
    </>
  );
}
