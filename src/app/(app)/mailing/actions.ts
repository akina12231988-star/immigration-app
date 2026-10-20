"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 郵送請求の記録への添付ファイル（転出届・住民票の画像など）。
// 非公開バケット app-files（mailing-files/）に保存し、署名付きURLで
// アップロード・表示する（所属機関の添付ファイルと同じ方式）。
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
export async function createMailingFileTicket(
  recordId: string,
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
  const path = `mailing-files/${recordId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にメタデータを記録する
export async function registerMailingFile(
  recordId: string,
  kind: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`mailing-files/${recordId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("mailing_files").insert({
    record_id: recordId,
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
export async function getMailingFilePreviewUrl(
  fileId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("mailing_files")
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
export async function deleteMailingFile(fileId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("mailing_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("mailing_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ---- 代理人（職員）の身分証明書（mailing_agent_documents・0186） ----
// 代理人として郵送請求するときに同封する本人確認書類の写し。代理人の名前ごとに登録し、
// 郵送請求の画面で代理人を入力したらすぐ開いて印刷できるようにする

export async function createAgentDocTicket(
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
  const path = `agent-docs/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

export async function registerAgentDoc(
  agentName: string,
  label: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith("agent-docs/")) return { ok: false, message: "不正なパス" };
  if (!agentName.trim()) return { ok: false, message: "代理人の名前を入れてください" };
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data, error } = await admin
    .from("mailing_agent_documents")
    .insert({
      agent_name: agentName.trim(),
      label: label.trim(),
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      uploaded_by: me?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    const missing = /mailing_agent_documents/.test(error.message) && /not find|does not exist/i.test(error.message);
    return {
      ok: false,
      message: missing
        ? `${error.message}／マイグレーション 0186_mailing_agent_documents.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。`
        : error.message,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function getAgentDocPreviewUrl(docId: string): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin.from("mailing_agent_documents").select("storage_path").eq("id", docId).maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "ファイルが見つかりません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

export async function deleteAgentDoc(docId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin.from("mailing_agent_documents").select("storage_path").eq("id", docId).maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("mailing_agent_documents").delete().eq("id", docId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
