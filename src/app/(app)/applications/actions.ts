"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import type { ApplicationFile, ApplicationFileKind } from "@/types/application";
import type { ApplicationFileRow } from "@/types/db";
import { APPLICATION_FILE_KINDS } from "@/types/application";
import { applicationDocWindow, isDocInWindow, LINKED_DOC_KINDS } from "@/lib/application-doc-link";
import { jstDateStr } from "@/lib/jst-date";

// 申請画像は非公開バケット app-files に保存し、閲覧は署名付きURL経由。
// アップロードは「サーバーで署名付きアップロードURLを発行 → クライアントが直接PUT」方式
// （Storage側のRLSポリシー設定が不要で、サーバーの転送量制限も受けない）。

const BUCKET = "app-files";
const SIGNED_URL_TTL = 60 * 60; // 1時間
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

// Storage のオブジェクトキーは日本語不可のため、種別を英数字のフォルダ名に変換する
const KIND_SLUGS: Record<ApplicationFileKind, string> = {
  受付票: "receipt",
  受付完了メール: "receipt-mail-1",
  受付仮番号メール: "receipt-mail-2",
  受付番号メール: "receipt-mail-3",
  通知書: "notice",
  在留カード: "residence-card",
  照合結果: "card-check-result",
  指定書: "designation",
  追加資料通知: "extra-request",
  その他: "other",
};

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function requireStaff(): Promise<string | null> {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return null;
  return me.id;
}

async function ensureBucket(admin: Admin): Promise<void> {
  // 既存ならエラーになるだけなので無視してよい
  await admin.storage
    .createBucket(BUCKET, { public: false })
    .catch(() => undefined);
}

export interface UploadTicket {
  ok: true;
  path: string;
  token: string;
}

export interface ActionError {
  ok: false;
  message: string;
}

// 1) アップロード用の署名付きURLを発行する
export async function createUploadTicket(
  applicationId: string,
  kind: ApplicationFileKind,
  fileName: string,
  mimeType: string,
): Promise<UploadTicket | ActionError> {
  if (!(await requireStaff())) {
    return { ok: false, message: "画像の登録は admin / staff のみ可能です" };
  }
  if (!APPLICATION_FILE_KINDS.includes(kind)) {
    return { ok: false, message: "不正な画像種別です" };
  }
  if (!ALLOWED_MIME.test(mimeType)) {
    return { ok: false, message: "画像（JPEG/PNG/WebP/HEIC）またはPDFのみ登録できます" };
  }
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY が未設定のため画像を保存できません" };
  }
  await ensureBucket(admin);

  const rawExt = fileName.includes(".") ? (fileName.split(".").pop() ?? "") : "";
  const ext = /^[a-zA-Z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
  const path = `${applicationId}/${KIND_SLUGS[kind]}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, message: `アップロード準備に失敗しました: ${error?.message}` };
  }
  return { ok: true, path, token: data.token };
}

// 2) アップロード完了後にメタデータ行を登録する
export async function registerApplicationFile(
  applicationId: string,
  kind: ApplicationFileKind,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true; file: ApplicationFile } | ActionError> {
  const uploaderId = await requireStaff();
  if (!uploaderId) {
    return { ok: false, message: "画像の登録は admin / staff のみ可能です" };
  }
  // 発行時と同じ規則のパスのみ受け付ける（他申請のパスを紐づけさせない）
  if (!path.startsWith(`${applicationId}/${KIND_SLUGS[kind]}/`)) {
    return { ok: false, message: "不正なファイルパスです" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data, error } = await admin
    .from("application_files")
    .insert({
      application_id: applicationId,
      kind,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      uploaded_by: uploaderId,
    })
    .select()
    .single();
  if (error) return { ok: false, message: `登録に失敗しました: ${error.message}` };

  const row = data as ApplicationFileRow;
  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
  return {
    ok: true,
    file: {
      id: row.id,
      kind,
      fileName: row.file_name,
      url: signed?.signedUrl ?? "",
    },
  };
}

// 申請に紐づく画像一覧（署名付きURL付き）。
// 在留カード・照合結果・指定書は、外国人詳細の在留カード・指定書で登録した画像のうち
// この申請の許可の期間（許可日から次の許可日の前日まで）に登録した分も一緒に出す
// （どちらの画面で登録しても同じものが見えるようにする。id は "wd-<worker_documents.id>"）
export async function listApplicationFiles(
  applicationId: string,
): Promise<ApplicationFile[]> {
  const me = await getMyProfile();
  if (!me) return [];
  const admin = createAdminClient();
  if (!admin) return [];

  const [{ data }, linked] = await Promise.all([
    admin
      .from("application_files")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true }),
    listLinkedWorkerDocs(admin, applicationId).catch(() => [] as LinkedWorkerDoc[]),
  ]);
  const rows = (data as ApplicationFileRow[]) ?? [];
  const paths = [...rows.map((r) => r.storage_path), ...linked.map((d) => d.storage_path)];
  if (paths.length === 0) return [];

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);

  const own = rows.map((r, i) => ({
    id: r.id,
    kind: r.kind as ApplicationFileKind,
    fileName: r.file_name,
    url: signed?.[i]?.signedUrl ?? "",
    createdAt: r.created_at,
  }));
  const fromWorker = linked.map((d, i) => ({
    id: `wd-${d.id}`,
    kind: d.kind,
    fileName: d.file_name,
    url: signed?.[rows.length + i]?.signedUrl ?? "",
    createdAt: d.created_at,
    fromWorker: true as const,
  }));
  return [...own, ...fromWorker]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((f) => ({
      id: f.id,
      kind: f.kind,
      fileName: f.fileName,
      url: f.url,
      ...("fromWorker" in f ? { fromWorker: true } : {}),
    }));
}

interface LinkedWorkerDoc {
  id: string;
  kind: ApplicationFileKind;
  storage_path: string;
  file_name: string;
  created_at: string;
}

// 外国人詳細の在留カード・指定書で登録した画像のうち、この申請の許可の期間に登録した分
// （「現在」のタブで登録した画像だけ。過去の期間に登録した画像・リンク登録は含めない）
async function listLinkedWorkerDocs(admin: Admin, applicationId: string): Promise<LinkedWorkerDoc[]> {
  const { data: appRow } = await admin
    .from("immigration_applications")
    .select("id, worker_id, application_date, granted_permit_date, approval_date, withdrawn_on")
    .eq("id", applicationId)
    .maybeSingle();
  type AppRow = {
    id: string;
    worker_id: string | null;
    application_date: string;
    granted_permit_date: string | null;
    approval_date: string | null;
    withdrawn_on: string | null;
  };
  const app = appRow as AppRow | null;
  if (!app?.worker_id) return [];

  const [{ data: others }, { data: docs }] = await Promise.all([
    admin
      .from("immigration_applications")
      .select("id, worker_id, application_date, granted_permit_date, approval_date, withdrawn_on")
      .eq("worker_id", app.worker_id),
    admin
      .from("worker_documents")
      .select("id, kind, storage_path, file_name, effective_on, external_url, created_at")
      .eq("worker_id", app.worker_id)
      .in("kind", [...LINKED_DOC_KINDS])
      .order("created_at", { ascending: true }),
  ]);
  const toLink = (r: AppRow) => ({
    id: r.id,
    applicationDate: r.application_date,
    grantedPermitDate: r.granted_permit_date,
    approvalDate: r.approval_date,
    withdrawnOn: r.withdrawn_on,
  });
  const window = applicationDocWindow(toLink(app), ((others as AppRow[] | null) ?? []).map(toLink));
  return (
    (docs as {
      id: string;
      kind: ApplicationFileKind;
      storage_path: string;
      file_name: string;
      effective_on: string | null;
      external_url: string | null;
      created_at: string;
    }[] | null) ?? []
  )
    .filter((d) => d.storage_path && !d.effective_on && !(d.external_url ?? "").trim())
    .filter((d) => isDocInWindow(jstDateStr(new Date(d.created_at)), window))
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      storage_path: d.storage_path,
      file_name: d.file_name,
      created_at: d.created_at,
    }));
}

// 申請そのものを削除する（誤登録の取り消し用）。
// Storage上の画像 → メタデータ（cascade）→ 申請行 の順で消す。
export async function deleteApplication(
  applicationId: string,
): Promise<{ ok: true } | ActionError> {
  if (!(await requireStaff())) {
    return { ok: false, message: "削除は admin / staff のみ可能です" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data: fileRows } = await admin
    .from("application_files")
    .select("storage_path")
    .eq("application_id", applicationId);
  const paths = ((fileRows as { storage_path: string }[]) ?? []).map(
    (r) => r.storage_path,
  );
  if (paths.length > 0) {
    await admin.storage.from(BUCKET).remove(paths).catch(() => undefined);
  }

  const { error } = await admin
    .from("immigration_applications")
    .delete()
    .eq("id", applicationId);
  if (error) return { ok: false, message: `削除に失敗しました: ${error.message}` };
  return { ok: true };
}

export async function deleteApplicationFile(
  fileId: string,
): Promise<{ ok: true } | ActionError> {
  if (!(await requireStaff())) {
    return { ok: false, message: "削除は admin / staff のみ可能です" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  // 外国人詳細の在留カード・指定書で登録した画像（wd-<id>）は worker_documents を消す
  // （外国人詳細からも消える。実体はそこにしか無い）
  if (fileId.startsWith("wd-")) {
    const docId = fileId.slice(3);
    const { data: doc } = await admin
      .from("worker_documents")
      .select("storage_path")
      .eq("id", docId)
      .maybeSingle();
    const docPath = (doc as { storage_path: string } | null)?.storage_path;
    if (docPath) await admin.storage.from(BUCKET).remove([docPath]).catch(() => undefined);
    const { error } = await admin.from("worker_documents").delete().eq("id", docId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  const { data } = await admin
    .from("application_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (data?.storage_path) {
    await admin.storage.from(BUCKET).remove([data.storage_path]);
  }
  const { error } = await admin.from("application_files").delete().eq("id", fileId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
