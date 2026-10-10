"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { StaffRole } from "@/types/db";

export interface InviteResult {
  ok: boolean;
  message: string;
}

// 職員をメール招待し、初期ロールを設定する（admin のみ実行可）
export async function inviteUser(email: string, role: StaffRole): Promise<InviteResult> {
  const me = await getMyProfile();
  if (!me || me.role !== "admin") {
    return { ok: false, message: "管理者のみ招待できます" };
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: "メールアドレスの形式が正しくありません" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY が未設定のため招待できません。Supabase ダッシュボードの Authentication → Users → Invite user から招待してください。",
    };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmed);
  if (error) {
    return { ok: false, message: `招待に失敗しました: ${error.message}` };
  }
  // profiles 行はトリガーで自動作成される。初期ロールを反映する
  if (data.user && role !== "viewer") {
    await admin.from("profiles").update({ role }).eq("id", data.user.id);
  }
  revalidatePath("/admin/users");
  return { ok: true, message: `${trimmed} に招待メールを送信しました` };
}

// 職員の認証アプリ（二段階認証）の登録をすべて解除する（admin のみ実行可）。
// スマホの機種変更・紛失で本人がコードを出せなくなったときに使う。
// 解除した職員は、次のログインで認証アプリを登録し直す画面になる
export async function resetUserMfa(userId: string): Promise<InviteResult> {
  const me = await getMyProfile();
  if (!me || me.role !== "admin") {
    return { ok: false, message: "管理者のみ解除できます" };
  }
  if (userId === me.id) {
    return { ok: false, message: "自分自身の認証アプリは解除できません（誤操作防止）" };
  }
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY が未設定のため解除できません。Supabase ダッシュボードの Authentication → Users → 該当ユーザー → Multi-Factor から削除してください。",
    };
  }
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) {
    return { ok: false, message: `登録状況を取得できませんでした: ${error.message}` };
  }
  const factors = data?.factors ?? [];
  if (factors.length === 0) {
    return { ok: true, message: "登録済みの認証アプリはありません" };
  }
  for (const f of factors) {
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (delError) {
      return { ok: false, message: `解除に失敗しました: ${delError.message}` };
    }
  }
  revalidatePath("/admin/users");
  return { ok: true, message: "認証アプリを解除しました。次のログインで登録し直す画面になります" };
}
