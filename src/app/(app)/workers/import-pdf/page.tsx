import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { ImportPdfClient } from "./ImportPdfClient";

export const dynamic = "force-dynamic";

export default async function WorkersImportPdfPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  if (me.role === "viewer") redirect("/workers");

  return (
    <>
      <AppHeader title="履歴書PDFの取り込み" backHref="/workers" />
      <ImportPdfClient />
    </>
  );
}
