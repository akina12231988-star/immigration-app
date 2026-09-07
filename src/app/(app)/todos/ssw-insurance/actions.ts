"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 特定技能総合保険の被保険者証明書（画像・PDF）。
// 非公開バケット app-files（ssw-insurance/{worker_id}/...）に保存し、
// 署名付きURLでアップロード・表示する（随時報告書の添付と同じ方式・0139）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
const PREFIX = "ssw-insurance";

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

// アップロード用の署名付きURLを発行
export async function createSswCertTicket(
  workerId: string,
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
  const path = `${PREFIX}/${workerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// 被保険者証明書を記録する（ファイルなしで番号・期限だけの記録もできる）
export async function registerSswCert(input: {
  workerId: string;
  certNo: string;
  expiryDate: string;
  path?: string;
  fileName?: string;
  mimeType?: string;
}): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const path = input.path ?? "";
  // 発行時と同じ規則のパスのみ受け付ける（他の人のファイルを紐づけさせない）
  if (path && !path.startsWith(`${PREFIX}/${input.workerId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("worker_ssw_insurance_certs").insert({
    worker_id: input.workerId,
    cert_no: input.certNo,
    expiry_date: input.expiryDate || null,
    storage_path: path,
    file_name: input.fileName ?? "",
    mime_type: input.mimeType ?? "",
    uploaded_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 表示用の署名付きURL
export async function getSswCertPreviewUrl(
  certId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("worker_ssw_insurance_certs")
    .select("storage_path")
    .eq("id", certId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "ファイルが見つかりません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

// 記録の削除（ファイルの実体も消す）
export async function deleteSswCert(certId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("worker_ssw_insurance_certs")
    .select("storage_path")
    .eq("id", certId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("worker_ssw_insurance_certs").delete().eq("id", certId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
