import { AppHeader } from "@/components/AppHeader";
import { UpdatesClient } from "./UpdatesClient";

// アプリの更新のお知らせ（新機能・変更点）。内容は src/lib/release-notes.ts
export const dynamic = "force-static";

export default function UpdatesPage() {
  return (
    <>
      <AppHeader title="更新のお知らせ" backHref="/" />
      <UpdatesClient />
    </>
  );
}
