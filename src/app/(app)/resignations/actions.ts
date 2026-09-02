"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import {
  ADHOC_FILE_TARGETS,
  isAdhocFileKind,
  type AdhocFileKind,
} from "@/lib/adhoc-report-files";

// 随時報告書の署名済み届出書（スキャンしたPDF・画像）。
// 退職の記録と契約内容変更の記録で同じ処理を使う（kind で置き場所を切り替える）。
// 非公開バケット app-files に保存し、署名付きURLで
// アップロード・表示する（郵送請求の添付と同じ方式）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

interface Err {
  ok: false;
  message: string;
}

export interface AdhocFileView {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export async function listAdhocFiles(
  kind: AdhocFileKind,
  recordId: string,
): Promise<AdhocFileView[]> {
  if (!isAdhocFileKind(kind)) return [];
  const target = ADHOC_FILE_TARGETS[kind];
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return [];
  const { data } = await admin
    .from(target.table)
    .select("id, file_name, mime_type, created_at")
    .eq(target.column, recordId)
    .order("created_at", { ascending: true });
  return (data as AdhocFileView[]) ?? [];
}

// アップロード用の署名付きURLを発行
export async function createAdhocFileTicket(
  kind: AdhocFileKind,
  recordId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!isAdhocFileKind(kind)) return { ok: false, message: "不正な種別です" };
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `${ADHOC_FILE_TARGETS[kind].prefix}/${recordId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にメタデータを記録する
export async function registerAdhocFile(
  kind: AdhocFileKind,
  recordId: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!isAdhocFileKind(kind)) return { ok: false, message: "不正な種別です" };
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const target = ADHOC_FILE_TARGETS[kind];
  // 発行時と同じ規則のパスのみ受け付ける（他の記録のパスを紐づけさせない）
  if (!path.startsWith(`${target.prefix}/${recordId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from(target.table).insert({
    [target.column]: recordId,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
    uploaded_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 表示用の署名付きURL
export async function getAdhocFilePreviewUrl(
  kind: AdhocFileKind,
  fileId: string,
): Promise<{ ok: true; url: string } | Err> {
  if (!isAdhocFileKind(kind)) return { ok: false, message: "不正な種別です" };
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from(ADHOC_FILE_TARGETS[kind].table)
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
export async function deleteAdhocFile(
  kind: AdhocFileKind,
  fileId: string,
): Promise<{ ok: true } | Err> {
  if (!isAdhocFileKind(kind)) return { ok: false, message: "不正な種別です" };
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const table = ADHOC_FILE_TARGETS[kind].table;
  const { data } = await admin
    .from(table)
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from(table).delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
