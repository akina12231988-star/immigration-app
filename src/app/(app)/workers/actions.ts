"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { dbErrorMessage } from "@/lib/errors";

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

// ---- 在留カード・指定書・雇用契約書・雇用条件書・雇用保険の書類の履歴（worker_documents） ----

type WorkerDocKind =
  | "在留カード"
  | "指定書"
  | "雇用契約書"
  | "雇用条件書"
  | "雇用契約書（日付なし）"
  | "雇用条件書（日付なし）"
  | "雇用保険 離職票"
  | "雇用保険 被保険者証";
const DOC_SLUGS: Record<WorkerDocKind, string> = {
  在留カード: "residence-card",
  指定書: "designation",
  雇用契約書: "employment-contract",
  雇用条件書: "employment-conditions",
  // 一旦日付なしで印鑑・署名をもらってきた版（あとから正式な日付入りを上の種別で保存する）
  "雇用契約書（日付なし）": "employment-contract-undated",
  "雇用条件書（日付なし）": "employment-conditions-undated",
  "雇用保険 離職票": "employment-insurance-separation",
  "雇用保険 被保険者証": "employment-insurance-card",
};

export async function createWorkerDocTicket(
  workerId: string,
  kind: WorkerDocKind,
  fileName: string,
  mimeType: string,
  organizationId?: string | null,
): Promise<{ ok: true; path: string; token: string } | Err> {
  void organizationId; // 保存先のパスは種別ごと。機関は registerWorkerDoc で記録する
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
  organizationId?: string | null,
  // 過去の在籍期間タブから登録するとき、その期間の日付（いつ時点の書類か）
  effectiveOn?: string | null,
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
    // 雇用契約書・雇用条件書は会社ごとに保管する（転職で混ざらないように）
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(effectiveOn ? { effective_on: effectiveOn } : {}),
  });
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(error, "0100_worker_document_effective_on.sql", "登録に失敗しました"),
    };
  }
  return { ok: true };
}

// 登録済みの書類の所属機関を付け替える（違う会社で登録してしまったときの訂正）。
// worker_documents に update のRLSポリシーが無いため、管理クライアントで更新する
export async function setWorkerDocOrganization(
  docId: string,
  organizationId: string | null,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin
    .from("worker_documents")
    .update({ organization_id: organizationId })
    .eq("id", docId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 間違えて登録した書類を削除する（保存したファイルの実体も消す）。
// worker_documents に delete のRLSポリシーが無いため、管理クライアントで削除する。
// 申請登録時の画像（fromApplication）はこの表には無いため、ここでは消せない
export async function deleteWorkerDoc(docId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  const { data } = await admin
    .from("worker_documents")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  }
  const { error } = await admin.from("worker_documents").delete().eq("id", docId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ダウンロード時のファイル名: 氏名_書類名_所属機関名.拡張子
// （雇用契約書・雇用条件書は会社ごとに保管するため会社名まで入れる）。
// ファイル名に使えない文字は全角・中黒に置き換える
function workerDocFileName(
  workerName: string,
  kind: string,
  orgName: string,
  original: string,
): string {
  const ext = original.includes(".") ? (original.split(".").pop() ?? "") : "";
  const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "・").trim();
  const base = [safe(workerName), safe(kind), safe(orgName)].filter(Boolean).join("_");
  const name = base || safe(original) || "document";
  return ext ? `${name}.${ext.toLowerCase()}` : name;
}

export interface WorkerDocView {
  id: string;
  kind: WorkerDocKind;
  url: string;
  downloadUrl?: string; // ダウンロード用（Content-Disposition: attachment の署名付きURL）
  fileName?: string;
  downloadName?: string; // ダウンロード時の名前（氏名_書類名_所属機関名）
  mimeType?: string;
  organizationId?: string | null; // 雇用契約書・雇用条件書の所属機関（0081）
  effectiveOn?: string | null; // いつ時点の書類か（過去の在籍期間への登録用・0100）
  createdAt: string;
  fromApplication?: boolean; // 申請登録時の画像（差し替え前の現データ）
}

// 在留カード・指定書の全履歴（新しい順・署名付きURL）。
// 外国人管理で差し替えた worker_documents に加え、まだ差し替えていない種別は
// 申請登録時に記録した最新画像（application_files）を「現データ」として表示する。
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
    (data as {
      id: string;
      kind: WorkerDocKind;
      storage_path: string;
      file_name: string;
      mime_type: string;
      organization_id?: string | null;
      effective_on?: string | null;
      created_at: string;
    }[]) ?? [];

  const result: WorkerDocView[] = [];
  if (rows.length > 0) {
    const paths = rows.map((r) => r.storage_path);

    // ダウンロードしたときのファイル名を「氏名_書類名_所属機関名」にするため、
    // 外国人の氏名と、書類に紐づく所属機関の名前を引く
    const { data: w } = await admin
      .from("workers")
      .select("name")
      .eq("id", workerId)
      .maybeSingle();
    const workerName = (w as { name: string } | null)?.name ?? "";
    const orgIds = [...new Set(rows.map((r) => r.organization_id).filter(Boolean))] as string[];
    const orgNames = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const o of (orgs as { id: string; name: string }[] | null) ?? []) {
        orgNames.set(o.id, o.name);
      }
    }

    // 表示用（そのまま開く）と、ファイル保存用（名前を付けて保存）の署名付きURLを作る
    const downloadNames = rows.map((r) =>
      workerDocFileName(
        workerName,
        r.kind,
        r.organization_id ? (orgNames.get(r.organization_id) ?? "") : "",
        r.file_name,
      ),
    );
    const [{ data: signed }, signedDl] = await Promise.all([
      admin.storage.from(BUCKET).createSignedUrls(paths, TTL),
      Promise.all(
        rows.map((r, i) =>
          admin.storage
            .from(BUCKET)
            .createSignedUrl(r.storage_path, TTL, { download: downloadNames[i] })
            .then((res) => res.data?.signedUrl ?? ""),
        ),
      ),
    ]);
    rows.forEach((r, i) =>
      result.push({
        id: r.id,
        kind: r.kind,
        url: signed?.[i]?.signedUrl ?? "",
        downloadUrl: signedDl[i] ?? "",
        fileName: r.file_name,
        downloadName: downloadNames[i],
        mimeType: r.mime_type,
        organizationId: r.organization_id ?? null,
        effectiveOn: r.effective_on ?? null,
        createdAt: r.created_at,
      }),
    );
  }

  // worker_documents に無い種別は申請登録時の画像を現データとして補う
  const kinds: WorkerDocKind[] = ["在留カード", "指定書"];
  const missing = kinds.filter((k) => !result.some((d) => d.kind === k));
  if (missing.length > 0) {
    const { data: apps } = await admin
      .from("immigration_applications")
      .select("id")
      .eq("worker_id", workerId);
    const appIds = ((apps as { id: string }[]) ?? []).map((a) => a.id);
    if (appIds.length > 0) {
      for (const kind of missing) {
        const { data: f } = await admin
          .from("application_files")
          .select("id, storage_path, created_at")
          .in("application_id", appIds)
          .eq("kind", kind)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const row = f as { id: string; storage_path: string; created_at: string } | null;
        if (row) {
          const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(row.storage_path, TTL);
          result.push({
            id: `app-${row.id}`,
            kind,
            url: signed?.signedUrl ?? "",
            createdAt: row.created_at,
            fromApplication: true,
          });
        }
      }
    }
  }

  return result;
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
