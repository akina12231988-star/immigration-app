import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { verifiedTotpFactors } from "@/lib/mfa";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const profiles = (data as Profile[]) ?? [];

  // 各職員の認証アプリ（二段階認証）の登録状況。service_role キーが無い環境では不明（null）
  const admin = createAdminClient();
  const mfaEnrolled: Record<string, boolean | null> = {};
  if (admin) {
    await Promise.all(
      profiles.map(async (p) => {
        const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: p.id });
        mfaEnrolled[p.id] = f ? verifiedTotpFactors(f.factors).length > 0 : null;
      }),
    );
  }

  return (
    <>
      <AppHeader title="職員・権限管理" backHref="/" />
      <UsersAdmin profiles={profiles} myId={me.id} mfaEnrolled={mfaEnrolled} />
    </>
  );
}
