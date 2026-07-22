"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { onboardingDownloadName } from "@/lib/onboarding";
import type { OnboardingDocumentRow } from "@/types/db";

// 入社書類ファイルは非公開バケット app-files（onboarding-docs/）に保存し、署名付きURLで扱う
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

// 書類ファイルアップロード用の署名付きURLを発行
export async function createOnboardingDocTicket(
  workerId: string,
  docKey: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ登録できます" };
  if (!/^[a-z0-9_]{1,32}$/.test(docKey)) return { ok: false, message: "不正な書類キー" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `onboarding-docs/${workerId}/${docKey}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にファイル情報を書類行へ記録する
// （既存行の status・note などは保持し、行が無ければ新規作成する）
export async function registerOnboardingDocFile(
  workerId: string,
  docKey: string,
  label: string,
  sortNo: number,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`onboarding-docs/${workerId}/${docKey}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("onboarding_documents").upsert(
    {
      worker_id: workerId,
      doc_key: docKey,
      label,
      sort_no: sortNo,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "worker_id,doc_key" },
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ダウンロード用の署名付きURL。ファイル名は「外国人の氏名＋添付データ名」になる
export async function getOnboardingDocDownloadUrl(
  docId: string,
): Promise<{ ok: true; url: string; fileName: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };

  const { data, error } = await admin
    .from("onboarding_documents")
    .select("storage_path, file_name, label, workers(name)")
    .eq("id", docId)
    .maybeSingle();
  if (error || !data) return { ok: false, message: "書類が見つかりません" };

  const row = data as unknown as Pick<OnboardingDocumentRow, "storage_path" | "file_name" | "label"> & {
    workers: { name: string } | null;
  };
  if (!row.storage_path) return { ok: false, message: "ファイルが未登録です" };

  const downloadName = onboardingDownloadName(row.workers?.name ?? "", row.label, row.file_name);
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, TTL, { download: downloadName });
  if (signErr || !signed) return { ok: false, message: `URL発行に失敗: ${signErr?.message}` };
  return { ok: true, url: signed.signedUrl, fileName: downloadName };
}

// プレビュー用の署名付きURL（ブラウザ内で開く）
export async function getOnboardingDocPreviewUrl(
  docId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("onboarding_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "ファイルが未登録です" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}
