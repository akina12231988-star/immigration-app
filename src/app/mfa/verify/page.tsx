import { redirect } from "next/navigation";
import { MFA_SETUP_PATH, mfaStep, safeNextPath } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { MfaShell } from "../MfaShell";
import { VerifyForm } from "./VerifyForm";

export const dynamic = "force-dynamic";

// ログイン後の認証アプリのコード入力
export default async function MfaVerifyPage({
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
  if (step === "setup") {
    redirect(safeNext === "/" ? MFA_SETUP_PATH : `${MFA_SETUP_PATH}?next=${encodeURIComponent(safeNext)}`);
  }

  return (
    <MfaShell
      title="認証アプリのコードを入れてください"
      lead="スマホの認証アプリ（Google Authenticator など）を開き、「入管申請管理」に表示されている6桁の数字を入れてください。"
      email={user.email ?? null}
    >
      <VerifyForm next={safeNext} />
    </MfaShell>
  );
}
