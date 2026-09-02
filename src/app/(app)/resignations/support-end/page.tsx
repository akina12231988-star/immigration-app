import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { Card } from "@/components/ui/Card";
import { AdhocReportTabs } from "../AdhocReportTabs";

export const dynamic = "force-dynamic";

// 支援委託終了の記録。中身（様式・入力する項目）はこれから作る。
export default async function SupportEndPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="随時報告書" backHref="/" />
      <div className="mb-4">
        <AdhocReportTabs />
      </div>
      <Card className="p-8 text-center">
        <p className="text-sm font-bold">支援委託終了の記録はこれから作ります。</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          登録支援機関との支援委託契約が終了したときの随時届出をここで作れるようにします。
          いま使えるのは「退職の記録」と「契約内容変更の記録」です。
        </p>
      </Card>
    </>
  );
}
