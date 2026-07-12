import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

// ログイン中ユーザーの profiles 行を取得（未ログイン・無効化済みなら null）
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return data as Profile;
}
