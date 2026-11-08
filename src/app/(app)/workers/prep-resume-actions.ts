"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 申請準備の「所属機関への採用条件の確認」に付ける履歴書の画像。
// 非公開バケット app-files の prep-resumes/{準備リストID}/ に保存し、署名付きURLでアップロード・表示する
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/;

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export async function createPrepResumeTicket(
  checklistId: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "履歴書は画像（JPEG・PNG・WebP）で登録してください（LINEに画像として貼るため）" };
  if (!/^[0-9a-f-]{36}$/i.test(checklistId)) return { ok: false, message: "不正な準備リストです" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `prep-resumes/${checklistId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

export async function getPrepResumeUrl(checklistId: string, path: string): Promise<{ ok: true; url: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`prep-resumes/${checklistId}/`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !data) return { ok: false, message: `URLの発行に失敗: ${error?.message}` };
  return { ok: true, url: data.signedUrl };
}

export async function removePrepResume(checklistId: string, path: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`prep-resumes/${checklistId}/`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  return { ok: true };
}
