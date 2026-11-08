"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 会社からの書類の依頼（0183）の添付ファイル（0185）。
// 外国人 × 書類のマスに落とした書類を、非公開バケット app-files（doc-request-files/）に保存し、
// 署名付きURLでアップロード・表示する（所属機関の添付ファイルと同じ方式）。
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
export async function createDocRequestFileTicket(
  requestId: string,
  workerId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ添付できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `doc-request-files/${requestId}/${workerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード完了後にメタデータを記録する
export async function registerDocRequestFile(
  requestId: string,
  workerId: string,
  itemId: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`doc-request-files/${requestId}/${workerId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data, error } = await admin
    .from("organization_document_request_files")
    .insert({
      request_id: requestId,
      worker_id: workerId,
      item_id: itemId,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      uploaded_by: me?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    const missing = /organization_document_request_files/.test(error.message) && /not find|does not exist/i.test(error.message);
    return {
      ok: false,
      message: missing
        ? `${error.message}／マイグレーション 0185_organization_document_request_files.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。`
        : error.message,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// 表示用の署名付きURL
export async function getDocRequestFilePreviewUrl(fileId: string): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("organization_document_request_files")
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
export async function deleteDocRequestFile(fileId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("organization_document_request_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("organization_document_request_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 外国人詳細の申告書の作成画面などから、書類をマスに添付したあとの印付け。
// まだなら「添付済み」（issued_on）を付け、会社へ送る書類を「このマスに添付したもの」に決める（0220）。
// 0220 未適用なら use_doc は付けずに保存し、そのことを返す
export async function markDocRequestCellAttached(
  requestId: string,
  workerId: string,
  itemId: string,
  today: string,
  // 作った申告書の中身（扶養控除等申告書のとき。あとで送金額が変わったかを見る）
  detail?: { kind: string; year: string; names: string[] },
): Promise<{ ok: true; useDocSaved: boolean } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const table = "organization_document_request_checks";
  const { data: existing, error: getErr } = await admin
    .from(table)
    .select("*")
    .eq("request_id", requestId)
    .eq("worker_id", workerId)
    .eq("item_id", itemId)
    .maybeSingle();
  if (getErr) return { ok: false, message: getErr.message };
  const cur = (existing as Record<string, unknown> | null) ?? null;
  const base: Record<string, unknown> = {
    request_id: requestId,
    worker_id: workerId,
    item_id: itemId,
    informed_on: cur?.informed_on ?? null,
    issued_on: cur?.issued_on ?? null,
    sent_on: cur?.sent_on ?? null,
    not_needed: cur?.not_needed ?? false,
    note: cur?.note ?? "",
  };
  if (!base.issued_on && !base.not_needed) {
    base.issued_on = today;
    // 「無い」と回答していたなら、手に入ったので外す（0198 未適用でも止まらないよう、値があるときだけ）
    if (cur?.none_replied_on) base.none_replied_on = null;
  }
  const opts = { onConflict: "request_id,worker_id,item_id" };
  const { error } = await admin.from(table).upsert({ ...base, use_doc: "cell", use_doc_detail: detail ?? null }, opts);
  if (!error) return { ok: true, useDocSaved: true };
  if (!error.message.includes("use_doc")) return { ok: false, message: error.message };
  const { error: e2 } = await admin.from(table).upsert(base, opts);
  if (e2) return { ok: false, message: e2.message };
  return { ok: true, useDocSaved: false };
}
