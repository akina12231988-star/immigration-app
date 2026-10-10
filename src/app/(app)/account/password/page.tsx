import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

// ログイン中の自分のパスワードを変える
export default async function ChangePasswordPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");
  return (
    <>
      <AppHeader title="パスワードの変更" backHref="/" />
      <div className="mx-auto max-w-md">
        <Card className="p-5">
          <p className="mb-4 text-xs leading-relaxed text-muted">
            <b className="text-foreground">{me.email}</b> のログインパスワードを変えます。認証アプリ（二段階認証）の登録はそのまま使えます。
          </p>
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
