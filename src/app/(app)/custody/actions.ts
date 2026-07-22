"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 預かり証に載せる在留カード画像は非公開バケット app-files に保存し、署名付きURLで表示する
const BUCKET = "app-files";
const TTL = 60 * 60;

interface Err {
  ok: false;
  message: string;
}

// アップロード用の署名付きURLを発行
export async function createCustodyImageTicket(
  slot: "front" | "back",
): Promise<{ ok: true; path: string; token: string } | Err> {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const path = `custody-cards/${crypto.randomUUID()}-${slot}.jpg`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// 預かり証表示用の署名付きURL（表面・裏面）
export async function getCustodyImageUrls(
  frontPath: string,
  backPath: string,
): Promise<{ frontUrl: string; backUrl: string }> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { frontUrl: "", backUrl: "" };

  async function signedFor(path: string): Promise<string> {
    if (!path) return "";
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(path, TTL);
    return data?.signedUrl ?? "";
  }
  return { frontUrl: await signedFor(frontPath), backUrl: await signedFor(backPath) };
}
