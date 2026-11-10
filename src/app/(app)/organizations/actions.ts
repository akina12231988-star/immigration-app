"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 所属機関の添付ファイル（見積書など）。非公開バケット app-files（org-files/）に保存し、
// 署名付きURLでアップロード・表示する（入社書類ファイルと同じ方式）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

// アップロード用の署名付きURLを発行
export async function createOrgFileTicket(
  organizationId: string,
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
  const path = `org-files/${organizationId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にメタデータを記録する
export async function registerOrgFile(
  organizationId: string,
  kind: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`org-files/${organizationId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("organization_files").insert({
    organization_id: organizationId,
    kind,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
    uploaded_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 表示用の署名付きURL
export async function getOrgFilePreviewUrl(
  fileId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("organization_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "ファイルが見つかりません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

// 添付ファイルの削除（ストレージの実体も消す）
export async function deleteOrgFile(fileId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("organization_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("organization_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ---- 所属機関のアイコン画像（ロゴマーク・代表者の顔写真。0221） ----

export type OrgIconKind = "logo" | "rep_photo";
const ICON_COL: Record<OrgIconKind, "logo_path" | "rep_photo_path"> = { logo: "logo_path", rep_photo: "rep_photo_path" };
const ICON_MIME = /^image\/(jpeg|png|webp)$/;

function iconMigrationMessage(message: string): string {
  return /logo_path|rep_photo_path/.test(message)
    ? `${message}／マイグレーション 0221_organization_icons.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。`
    : message;
}

// アイコン画像のアップロード用の署名付きURL
export async function createOrgIconTicket(
  organizationId: string,
  kind: OrgIconKind,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ICON_MIME.test(mimeType)) return { ok: false, message: "画像（JPEG・PNG・WebP）を選んでください" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `org-icons/${organizationId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードしたアイコンを機関に登録する（前の画像は消す）。表示用の署名付きURLを返す
export async function setOrgIcon(
  organizationId: string,
  kind: OrgIconKind,
  path: string,
): Promise<{ ok: true; url: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`org-icons/${organizationId}/${kind}-`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const col = ICON_COL[kind];
  const { data: before } = await admin.from("organizations").select(col).eq("id", organizationId).maybeSingle();
  const { error } = await admin.from("organizations").update({ [col]: path }).eq("id", organizationId);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return { ok: false, message: iconMigrationMessage(error.message) };
  }
  const old = (before as Record<string, string | null> | null)?.[col];
  if (old && old !== path) await admin.storage.from(BUCKET).remove([old]).catch(() => undefined);
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  return { ok: true, url: signed?.signedUrl ?? "" };
}

// アイコンを外す（画像も消す）
export async function removeOrgIcon(organizationId: string, kind: OrgIconKind): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const col = ICON_COL[kind];
  const { data: before } = await admin.from("organizations").select(col).eq("id", organizationId).maybeSingle();
  const { error } = await admin.from("organizations").update({ [col]: null }).eq("id", organizationId);
  if (error) return { ok: false, message: iconMigrationMessage(error.message) };
  const old = (before as Record<string, string | null> | null)?.[col];
  if (old) await admin.storage.from(BUCKET).remove([old]).catch(() => undefined);
  return { ok: true };
}
