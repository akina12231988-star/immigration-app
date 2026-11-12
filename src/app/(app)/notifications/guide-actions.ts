"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 在留カードの受け取りの手続きのイラスト（郵送で受け取る／郵送→窓口へ変更）。
// 画像は非公開バケット app-files（guides/）に置き、保存先は app_settings（key = card_pickup_guide）に持つ。
// 画面からドラッグ＆ドロップで登録・差し替えできる（マイグレーション不要。0149 の app_settings を使う）

const BUCKET = "app-files";
const TTL = 60 * 60;
const SETTING_KEY = "card_pickup_guide";
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

export type GuideImageKind = "mail" | "counter";
type Err = { ok: false; message: string };

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

async function readPaths(): Promise<Partial<Record<GuideImageKind, string>>> {
  const admin = createAdminClient();
  if (!admin) return {};
  const { data } = await admin.from("app_settings").select("value").eq("key", SETTING_KEY).maybeSingle();
  return ((data as { value: Partial<Record<GuideImageKind, string>> } | null)?.value ?? {}) as Partial<Record<GuideImageKind, string>>;
}

// 表示用の署名付きURL（登録されていない種類は入らない）
export async function getGuideImageUrls(): Promise<Partial<Record<GuideImageKind, string>>> {
  const me = await getMyProfile();
  if (!me) return {};
  const admin = createAdminClient();
  if (!admin) return {};
  const paths = await readPaths();
  const out: Partial<Record<GuideImageKind, string>> = {};
  for (const kind of ["mail", "counter"] as const) {
    const p = paths[kind];
    if (!p) continue;
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(p, TTL);
    if (data?.signedUrl) out[kind] = data.signedUrl;
  }
  return out;
}

// アップロード用の署名付きURL
export async function createGuideImageTicket(
  kind: GuideImageKind,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!IMAGE_MIME.test(mimeType)) return { ok: false, message: "画像（JPEG・PNG・WebP）を選んでください" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `guides/card-pickup-${kind}-${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードしたイラストを登録する（前の画像は消す）。表示用の署名付きURLを返す
export async function setGuideImage(kind: GuideImageKind, path: string): Promise<{ ok: true; url: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`guides/card-pickup-${kind}-`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const before = await readPaths();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: SETTING_KEY, value: { ...before, [kind]: path } }, { onConflict: "key" });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return { ok: false, message: error.message };
  }
  const old = before[kind];
  if (old && old !== path) await admin.storage.from(BUCKET).remove([old]).catch(() => undefined);
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  return { ok: true, url: signed?.signedUrl ?? "" };
}
