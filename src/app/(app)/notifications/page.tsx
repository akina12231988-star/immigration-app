import { AppHeader } from "@/components/AppHeader";
import { NotificationsClient } from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <>
      <AppHeader title="入管メール通知" backHref="/" />
      <NotificationsClient />
    </>
  );
}
