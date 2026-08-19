"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 退職＜随時報告＞の署名済み届出書（スキャンしたPDF・画像）。
// 非公開バケット app-files（resignation-files/）に保存し、署名付きURLで
// アップロード・表示する（郵送請求の添付と同じ方式）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

interface Err {
  ok: false;
  message: string;
}

export interface ResignationFileView {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export async function listResignationFiles(
  resignationId: string,
): Promise<ResignationFileView[]> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return [];
  const { data } = await admin
    .from("resignation_files")
    .select("id, file_name, mime_type, created_at")
    .eq("resignation_id", resignationId)
    .order("created_at", { ascending: true });
  return (data as ResignationFileView[]) ?? [];
}

// アップロード用の署名付きURLを発行
export async function createResignationFileTicket(
  resignationId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `resignation-files/${resignationId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にメタデータを記録する
export async function registerResignationFile(
  resignationId: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`resignation-files/${resignationId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("resignation_files").insert({
    resignation_id: resignationId,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
    uploaded_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 表示用の署名付きURL
export async function getResignationFilePreviewUrl(
  fileId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("resignation_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "ファイルが見つかりません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

// 添付の削除（ストレージの実体も消す）
export async function deleteResignationFile(fileId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("resignation_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("resignation_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
