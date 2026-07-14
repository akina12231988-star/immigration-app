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

// ---- 在留カード・指定書の履歴（worker_documents） ----

type WorkerDocKind = "在留カード" | "指定書";
const DOC_SLUGS: Record<WorkerDocKind, string> = {
  在留カード: "residence-card",
  指定書: "designation",
};

export async function createWorkerDocTicket(
  workerId: string,
  kind: WorkerDocKind,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mimeType)) {
    return { ok: false, message: "画像またはPDFのみ登録できます" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  await ensureBucket(admin);
  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `worker-docs/${workerId}/${DOC_SLUGS[kind]}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

export async function registerWorkerDoc(
  workerId: string,
  kind: WorkerDocKind,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`worker-docs/${workerId}/${DOC_SLUGS[kind]}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("worker_documents").insert({
    worker_id: workerId,
    kind,
    storage_path: path,
    file_name: fileName,
    mime_type: mimeType,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export interface WorkerDocView {
  id: string;
  kind: WorkerDocKind;
  url: string;
  createdAt: string;
}

// 在留カード・指定書の全履歴（新しい順・署名付きURL）
export async function listWorkerDocs(workerId: string): Promise<WorkerDocView[]> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return [];
  const { data } = await admin
    .from("worker_documents")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  const rows =
    (data as { id: string; kind: WorkerDocKind; storage_path: string; created_at: string }[]) ??
    [];
  if (rows.length === 0) return [];
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), TTL);
  return rows.map((r, i) => ({
    id: r.id,
    kind: r.kind,
    url: signed?.[i]?.signedUrl ?? "",
    createdAt: r.created_at,
  }));
}

// 外国人の最新の在留カード画像・指定書画像の署名付きURL。
// worker_documents（外国人管理で差し替えたもの）を優先し、無ければ申請の application_files を使う。
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

  async function signedFor(path: string | undefined): Promise<string> {
    if (!path) return "";
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(path, TTL);
    return data?.signedUrl ?? "";
  }

  async function latest(kind: string): Promise<string> {
    // 外国人管理で差し替えた worker_documents を優先
    const { data: doc } = await admin!
      .from("worker_documents")
      .select("storage_path")
      .eq("worker_id", workerId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const docPath = (doc as { storage_path: string } | null)?.storage_path;
    if (docPath) return signedFor(docPath);

    // 無ければ申請時に登録された画像
    if (appIds.length === 0) return "";
    const { data } = await admin!
      .from("application_files")
      .select("storage_path")
      .in("application_id", appIds)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return signedFor((data as { storage_path: string } | null)?.storage_path);
  }

  return {
    residenceCardUrl: await latest("在留カード"),
    designationUrl: await latest("指定書"),
  };
}
