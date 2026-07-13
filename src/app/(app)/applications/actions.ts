"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { ApplicationFile, ApplicationFileKind } from "@/types/application";
import type { ApplicationFileRow } from "@/types/db";
import { APPLICATION_FILE_KINDS } from "@/types/application";

// 申請画像は非公開バケット app-files に保存し、閲覧は署名付きURL経由。
// アップロードは「サーバーで署名付きアップロードURLを発行 → クライアントが直接PUT」方式
// （Storage側のRLSポリシー設定が不要で、サーバーの転送量制限も受けない）。

const BUCKET = "app-files";
const SIGNED_URL_TTL = 60 * 60; // 1時間
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function requireStaff(): Promise<string | null> {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return null;
  return me.id;
}

async function ensureBucket(admin: Admin): Promise<void> {
  // 既存ならエラーになるだけなので無視してよい
  await admin.storage
    .createBucket(BUCKET, { public: false })
    .catch(() => undefined);
}

export interface UploadTicket {
  ok: true;
  path: string;
  token: string;
}

export interface ActionError {
  ok: false;
  message: string;
}

// 1) アップロード用の署名付きURLを発行する
export async function createUploadTicket(
  applicationId: string,
  kind: ApplicationFileKind,
  fileName: string,
  mimeType: string,
): Promise<UploadTicket | ActionError> {
  if (!(await requireStaff())) {
    return { ok: false, message: "画像の登録は admin / staff のみ可能です" };
  }
  if (!APPLICATION_FILE_KINDS.includes(kind)) {
    return { ok: false, message: "不正な画像種別です" };
  }
  if (!ALLOWED_MIME.test(mimeType)) {
    return { ok: false, message: "画像（JPEG/PNG/WebP/HEIC）またはPDFのみ登録できます" };
  }
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY が未設定のため画像を保存できません" };
  }
  await ensureBucket(admin);

  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const path = `${applicationId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: `アップロード準備に失敗しました: ${error?.message}` };
  }
  return { ok: true, path, token: data.token };
}

// 2) アップロード完了後にメタデータ行を登録する
export async function registerApplicationFile(
  applicationId: string,
  kind: ApplicationFileKind,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; file: ApplicationFile } | ActionError> {
  const uploaderId = await requireStaff();
  if (!uploaderId) {
    return { ok: false, message: "画像の登録は admin / staff のみ可能です" };
  }
  // 発行時と同じ規則のパスのみ受け付ける（他申請のパスを紐づけさせない）
  if (!path.startsWith(`${applicationId}/${kind}/`)) {
    return { ok: false, message: "不正なファイルパスです" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data, error } = await admin
    .from("application_files")
    .insert({
      application_id: applicationId,
      kind,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      uploaded_by: uploaderId,
    })
    .select()
    .single();
  if (error) return { ok: false, message: `登録に失敗しました: ${error.message}` };

  const row = data as ApplicationFileRow;
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
  return {
    ok: true,
    file: {
      id: row.id,
      kind,
      fileName: row.file_name,
      url: signed?.signedUrl ?? "",
    },
  };
}

// 申請に紐づく画像一覧（署名付きURL付き）
export async function listApplicationFiles(
  applicationId: string,
): Promise<ApplicationFile[]> {
  const me = await getMyProfile();
  if (!me) return [];
  const admin = createAdminClient();
  if (!admin) return [];

  const { data } = await admin
    .from("application_files")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  const rows = (data as ApplicationFileRow[]) ?? [];
  if (rows.length === 0) return [];

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL);

  return rows.map((r, i) => ({
    id: r.id,
    kind: r.kind as ApplicationFileKind,
    fileName: r.file_name,
    url: signed?.[i]?.signedUrl ?? "",
  }));
}

export async function deleteApplicationFile(
  fileId: string,
): Promise<{ ok: true } | ActionError> {
  if (!(await requireStaff())) {
    return { ok: false, message: "削除は admin / staff のみ可能です" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data } = await admin
    .from("application_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (data?.storage_path) {
    await admin.storage.from(BUCKET).remove([data.storage_path]);
  }
  const { error } = await admin.from("application_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
