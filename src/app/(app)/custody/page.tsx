import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listCustody } from "@/lib/supabase/queries/custody";
import { listWorkersWithOrg } from "@/lib/supabase/queries/workers";
import { CustodyClient } from "./CustodyClient";

export const dynamic = "force-dynamic";

export default async function CustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string }>;
}) {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  const { no } = await searchParams;
  const initialNo = no ? Number.parseInt(no, 10) : undefined;

  const supabase = await createClient();
  const [records, workers] = await Promise.all([
    listCustody(supabase).catch(() => []),
    listWorkersWithOrg(supabase).catch(() => []),
  ]);

  return (
    <>
      <AppHeader title="保管ボックス（原本預かり）" backHref="/" />
      <CustodyClient
        initialRecords={records}
        workers={workers}
        canWrite={me.role !== "viewer"}
        meName={me.display_name}
        initialNo={Number.isFinite(initialNo) ? initialNo : undefined}
      />
    </>
  );
}
