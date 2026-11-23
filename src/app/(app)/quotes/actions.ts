"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 見積書の別紙（特定技能総合保険の案内など）のファイル。
// 非公開バケット app-files（quote-attachments/...）に置き、署名付きURLでアップロード・表示する。
// 一度登録すれば、どの見積書にも付けられる（quotes.attachment_ids で選ぶ）
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;
const PREFIX = "quote-attachments";

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && (me.role === "admin" || me.role === "staff");
}

// アップロード用の署名付きURLを発行
export async function createQuoteAttachmentTicket(
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "PDF または画像だけ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `${PREFIX}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードしたファイルを別紙として登録する
export async function registerQuoteAttachment(input: {
  path: string;
  name: string;
  fileName: string;
  mimeType: string;
}): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!input.path.startsWith(`${PREFIX}/`) || input.path.includes("..")) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const me = await getMyProfile();
  const { data, error } = await admin
    .from("quote_attachments")
    .insert({
      name: input.name.trim() || input.fileName,
      storage_path: input.path,
      file_name: input.fileName,
      mime_type: input.mimeType,
      uploaded_by: me?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    const msg = error?.message ?? "登録に失敗しました";
    return {
      ok: false,
      message: /quote_attachments/.test(msg)
        ? `${msg}／マイグレーション 0235_quotes.sql（別紙を足した版）を Supabase の SQL Editor でもう一度適用してください`
        : msg,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// 表示・印刷用の署名付きURL（複数まとめて）
export async function getQuoteAttachmentUrls(ids: string[]): Promise<Record<string, string>> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin || ids.length === 0) return {};
  const { data } = await admin.from("quote_attachments").select("id, storage_path").in("id", ids);
  const out: Record<string, string> = {};
  for (const row of (data as { id: string; storage_path: string }[] | null) ?? []) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, TTL);
    if (signed?.signedUrl) out[row.id] = signed.signedUrl;
  }
  return out;
}

// 別紙の名前を変える
export async function renameQuoteAttachment(id: string, name: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("quote_attachments").update({ name: name.trim() }).eq("id", id);
  return error ? { ok: false, message: error.message } : { ok: true };
}

// 別紙の削除（ファイルの実体も消す。付けていた見積書からは印刷されなくなる）
export async function deleteQuoteAttachment(id: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin.from("quote_attachments").select("storage_path").eq("id", id).maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("quote_attachments").delete().eq("id", id);
  return error ? { ok: false, message: error.message } : { ok: true };
}
