"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { LINKABLE_DOC_KINDS, onboardingDownloadName } from "@/lib/onboarding";
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

// 添付ファイルの取り消し（間違って添付した場合の削除）。
// ストレージの実体を消し、書類行のファイル列だけを空にする（ステータス・備考の行自体は残す）。
export async function clearOnboardingDocFile(
  workerId: string,
  docKey: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!/^[a-z0-9_]{1,32}$/.test(docKey)) return { ok: false, message: "不正な書類キー" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data } = await admin
    .from("onboarding_documents")
    .select("storage_path")
    .eq("worker_id", workerId)
    .eq("doc_key", docKey)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);

  const { error } = await admin
    .from("onboarding_documents")
    .update({ storage_path: "", file_name: "", mime_type: "", uploaded_at: null })
    .eq("worker_id", workerId)
    .eq("doc_key", docKey);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 在留カード・指定書を、登録済み（worker_documents。無ければ申請登録時の画像）から
// 複製して入社書類データに紐付ける。紐付け時点のファイルを複製するスナップショット方式。
export async function linkWorkerDocToOnboarding(
  workerId: string,
  docKey: string,
  label: string,
  sortNo: number,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const kind = LINKABLE_DOC_KINDS[docKey];
  if (!kind) return { ok: false, message: "紐付けできる書類ではありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  // 最新の登録済み書類（worker_documents）を優先。無ければ申請登録時の画像を使う。
  type DocSrc = { storage_path: string; file_name: string; mime_type: string };
  let src: DocSrc | null = null;
  const { data: wd } = await admin
    .from("worker_documents")
    .select("storage_path, file_name, mime_type")
    .eq("worker_id", workerId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  src = (wd as DocSrc | null) ?? null;

  if (!src) {
    const { data: apps } = await admin
      .from("immigration_applications")
      .select("id")
      .eq("worker_id", workerId);
    const appIds = ((apps as { id: string }[]) ?? []).map((a) => a.id);
    if (appIds.length > 0) {
      const { data: af } = await admin
        .from("application_files")
        .select("storage_path, file_name, mime_type")
        .in("application_id", appIds)
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      src = (af as DocSrc | null) ?? null;
    }
  }

  if (!src?.storage_path) {
    return { ok: false, message: `登録済みの${kind}が見つかりません。先に「在留カード・指定書」へ登録してください` };
  }

  const rawExt = src.storage_path.includes(".") ? (src.storage_path.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const destPath = `onboarding-docs/${workerId}/${docKey}/${crypto.randomUUID()}.${ext}`;

  // 既存の紐付けファイルがあれば差し替え前に控えておき、複製成功後に消す
  const { data: prev } = await admin
    .from("onboarding_documents")
    .select("storage_path")
    .eq("worker_id", workerId)
    .eq("doc_key", docKey)
    .maybeSingle();
  const prevPath = (prev as { storage_path: string } | null)?.storage_path;

  const { error: copyErr } = await admin.storage.from(BUCKET).copy(src.storage_path, destPath);
  if (copyErr) return { ok: false, message: `複製に失敗: ${copyErr.message}` };
  if (prevPath && prevPath !== destPath) {
    await admin.storage.from(BUCKET).remove([prevPath]).catch(() => undefined);
  }

  const { error } = await admin.from("onboarding_documents").upsert(
    {
      worker_id: workerId,
      doc_key: docKey,
      label,
      sort_no: sortNo,
      storage_path: destPath,
      file_name: src.file_name || `${kind}.${ext}`,
      mime_type: src.mime_type || "application/octet-stream",
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
