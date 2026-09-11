"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { ReminderImageKind } from "@/types/db";

// 督促の会話のスクショ（画像）。
// 非公開バケット app-files（reminders/{reminder_id}/...）に保存し、
// 署名付きURLでアップロード・表示する（特定技能総合保険の証明書と同じ方式・0139）。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;
const PREFIX = "reminders";

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

// アップロード用の署名付きURLを発行
export async function createReminderImageTicket(
  reminderId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像またはPDFのみ登録できます" };
  if (!/^[0-9a-f-]{36}$/.test(reminderId)) return { ok: false, message: "不正なID" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `${PREFIX}/${reminderId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードしたファイルを督促の画像として記録する
export async function registerReminderImage(input: {
  reminderId: string;
  path: string;
  fileName: string;
  mimeType: string;
  caption?: string;
  kind?: ReminderImageKind; // 会話のスクショ（既定）/ 立替の領収書 / 返金の証拠（0150）
}): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  // 発行時と同じ規則のパスのみ受け付ける（別の督促のファイルを紐づけさせない）
  if (!input.path.startsWith(`${PREFIX}/${input.reminderId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const kind = input.kind ?? "screenshot";
  const { data, error } = await admin
    .from("reminder_images")
    .insert({
      reminder_id: input.reminderId,
      storage_path: input.path,
      file_name: input.fileName,
      mime_type: input.mimeType,
      caption: input.caption ?? "",
      uploaded_by: me?.id ?? null,
      // 0150 未適用でも会話のスクショは登録できるよう、既定のときは kind を送らない
      ...(kind === "screenshot" ? {} : { kind }),
    })
    .select("id")
    .single();
  if (error || !data) {
    const msg = error?.message ?? "登録に失敗しました";
    if (kind !== "screenshot" && /kind/.test(msg)) {
      return { ok: false, message: `領収書・返金の画像を登録するには Supabase でマイグレーション 0150_reminder_advance.sql の適用が必要です（${msg}）` };
    }
    return { ok: false, message: msg };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// 表示用の署名付きURL（複数まとめて）
export async function getReminderImageUrls(
  imageIds: string[],
): Promise<Record<string, string>> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin || imageIds.length === 0) return {};
  const { data } = await admin
    .from("reminder_images")
    .select("id, storage_path")
    .in("id", imageIds);
  const out: Record<string, string> = {};
  for (const row of (data as { id: string; storage_path: string }[] | null) ?? []) {
    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, TTL);
    if (signed?.signedUrl) out[row.id] = signed.signedUrl;
  }
  return out;
}

// 画像の削除（ファイルの実体も消す）
export async function deleteReminderImage(imageId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("reminder_images")
    .select("storage_path")
    .eq("id", imageId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("reminder_images").delete().eq("id", imageId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
