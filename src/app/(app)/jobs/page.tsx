import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { listAllApplications } from "@/lib/supabase/queries/jobs";
import { listPostings } from "@/lib/supabase/queries/postings";
import { listOrganizations } from "@/lib/supabase/queries/organizations";
import { listReferralFeesByApplication } from "@/lib/supabase/queries/referrals";
import { JobsExplorer } from "./JobsExplorer";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  const supabase = await createClient();
  const [applications, postings, organizations, workersRes, referralFees] = await Promise.all([
    listAllApplications(supabase).catch(() => []),
    // 新規登録フォームの求人候補
    listPostings(supabase).catch(() => []),
    // 手数料台帳に追加するときの手数料の初期値（あっせん明細）用
    listOrganizations(supabase).catch(() => []),
    // 新規登録フォームの外国人候補
    supabase.from("workers").select("id, name").order("name", { ascending: true }),
    // 応募 → 紹介手数料台帳の状態（0078未適用でも一覧は使えるようにする）
    listReferralFeesByApplication(supabase).catch(() => ({})),
  ]);

  return (
    <>
      <AppHeader title="求職一覧" backHref="/" />
      <JobsExplorer
        applications={applications}
        postings={postings}
        organizations={organizations}
        workers={(workersRes.data as { id: string; name: string }[] | null) ?? []}
        initialReferralFees={referralFees}
        canEdit={me.role !== "viewer"}
      />
    </>
  );
}
