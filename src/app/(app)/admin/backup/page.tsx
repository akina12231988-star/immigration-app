import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { BackupDownload } from "./BackupDownload";

export const dynamic = "force-dynamic";

export default async function AdminBackupPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  return (
    <>
      <AppHeader title="バックアップ" backHref="/" />
      <BackupDownload />
    </>
  );
}
