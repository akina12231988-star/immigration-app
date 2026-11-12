import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  return (
    <>
      <AppHeader title="入管メール通知" backHref="/" />
      <NotificationsClient canEdit={me.role !== "viewer"} />
    </>
  );
}
