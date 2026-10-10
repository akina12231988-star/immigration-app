import { mfaStep } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

// ログイン中ユーザーの profiles 行を取得（未ログイン・無効化済みなら null）
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 二段階認証（認証アプリのコード）が済んでいないセッションは、ログイン済みとみなさない。
  // 業務画面・サーバーアクション・API のすべてで同じ基準にするためここで見る
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaStep(aal?.currentLevel, user.factors) !== "done") return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data as Profile;
}
