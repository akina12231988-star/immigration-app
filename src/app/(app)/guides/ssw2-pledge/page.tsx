import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Ssw2PledgeGuide } from "@/components/guides/Ssw2PledgeGuide";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 「２号の誓約書（参考様式第１－３２号）の作り方」の案内ページ。みんなに案内する用
export default async function Ssw2PledgeGuidePage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="２号の誓約書（1-32号）の作り方" backHref="/" />
      <Ssw2PledgeGuide />
    </>
  );
}
