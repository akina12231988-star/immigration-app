import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listCustody } from "@/lib/supabase/queries/custody";
import { QrSheetClient } from "./QrSheetClient";

export const dynamic = "force-dynamic";

export default async function CustodyQrPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const records = await listCustody(supabase).catch(() => []);

  return (
    <>
      <AppHeader title="保管ボックスQRコード" backHref="/custody" />
      <QrSheetClient records={records} />
    </>
  );
}
