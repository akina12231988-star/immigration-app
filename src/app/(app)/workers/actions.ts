"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";

// 外国人の顔写真・最新書類画像は非公開バケット app-files に保存し、署名付きURLで表示する。
const BUCKET = "app-files";
const TTL = 60 * 60;
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

async function ensureBucket(admin: Admin) {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
}

interface Err {
  ok: false;
  message: string;
}

// 顔写真アップロード用の署名付きURLを発行
export async function createWorkerPhotoTicket(
  workerId: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!ALLOWED_MIME.test(mimeType)) return { ok: false, message: "画像（JPEG/PNG/WebP）のみ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await ensureBucket(admin);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "jpg";
  const path = `worker-photos/${workerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロード後に workers.photo_path を更新し、署名付きURLを返す
export async function registerWorkerPhoto(
  workerId: string,
  path: string,
): Promise<{ ok: true; url: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`worker-photos/${workerId}/`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("workers").update({ photo_path: path }).eq("id", workerId);
  if (error) return { ok: false, message: error.message };
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  return { ok: true, url: data?.signedUrl ?? "" };
}

export async function getWorkerPhotoUrl(path: string | null): Promise<string> {
  if (!path) return "";
  const admin = createAdminClient();
  if (!admin) return "";
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  return data?.signedUrl ?? "";
}

// 外国人の最新の在留カード画像・指定書画像の署名付きURL（申請の application_files から取得）
export async function getWorkerLatestDocUrls(
  workerId: string,
): Promise<{ residenceCardUrl: string; designationUrl: string }> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { residenceCardUrl: "", designationUrl: "" };

  const { data: apps } = await admin
    .from("immigration_applications")
    .select("id")
    .eq("worker_id", workerId);
  const appIds = ((apps as { id: string }[]) ?? []).map((a) => a.id);
  if (appIds.length === 0) return { residenceCardUrl: "", designationUrl: "" };

  async function latest(kind: string): Promise<string> {
    const { data } = await admin!
      .from("application_files")
      .select("storage_path")
      .in("application_id", appIds)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const path = (data as { storage_path: string } | null)?.storage_path;
    if (!path) return "";
    const { data: signed } = await admin!.storage.from(BUCKET).createSignedUrl(path, TTL);
    return signed?.signedUrl ?? "";
  }

  return {
    residenceCardUrl: await latest("在留カード"),
    designationUrl: await latest("指定書"),
  };
}
