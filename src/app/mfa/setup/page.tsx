import { redirect } from "next/navigation";
import { MFA_VERIFY_PATH, mfaStep, safeNextPath } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { MfaShell } from "../MfaShell";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

// 認証アプリの登録（初回ログイン時、または管理者が解除したあと）
export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const step = mfaStep(aal?.currentLevel, user.factors);
  if (step === "done") redirect(safeNext);
  if (step === "verify") {
    redirect(safeNext === "/" ? MFA_VERIFY_PATH : `${MFA_VERIFY_PATH}?next=${encodeURIComponent(safeNext)}`);
  }

  return (
    <MfaShell
      title="認証アプリを登録してください"
      lead="不正ログインを防ぐため、パスワードに加えて認証アプリの6桁のコードが必要になりました。スマホの認証アプリ（Google Authenticator、Microsoft Authenticator など）でQRコードを読み取り、表示された6桁を入れてください。"
      email={user.email ?? null}
    >
      <SetupForm next={safeNext} />
    </MfaShell>
  );
}
