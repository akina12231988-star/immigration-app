import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

export const dynamic = "force-dynamic";

// Phase E で本実装するプレースホルダー
export default async function OrientationsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  return (
    <>
      <AppHeader title="生活オリエンテーション" backHref="/" />
      <Card className="p-6 text-center text-sm text-muted">
        生活オリエンテーション管理は準備中です。
      </Card>
    </>
  );
}
