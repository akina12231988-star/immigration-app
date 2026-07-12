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
