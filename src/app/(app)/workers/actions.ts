"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { workerDocFileName } from "@/lib/worker-doc-name";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { dbErrorMessage } from "@/lib/errors";
import { sortDocsByPeriodDate } from "@/lib/worker-doc-periods";

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
  | "照合結果"
  | "指定書"
  | "雇用契約書"
  | "雇用条件書"
  | "雇用契約書（日付なし）"
  | "雇用条件書（日付なし）"
  | "雇用保険 離職票"
  | "雇用保険 被保険者証";
const DOC_SLUGS: Record<WorkerDocKind, string> = {
  在留カード: "residence-card",
  照合結果: "card-check-result", // 在留カード等読取アプリケーションで照合した結果（0192）
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
  // 自分で追加した期間（worker_document_periods）のタブから登録するとき、その期間のID（0197）
  periodId?: string | null,
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
    ...(periodId ? { period_id: periodId } : {}),
  });
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(
        error,
        periodId ? "0197_worker_document_periods.sql" : "0100_worker_document_effective_on.sql",
        "登録に失敗しました",
      ),
    };
  }
  // 「現在」の画像として登録（差し替え）したときは、手で選んだ「現在の画像」（0210）の指定を外す
  // （古い選択が残って、差し替えた新しい画像が個人票に出ないのを防ぐ。0210 未適用の環境ではエラーを無視）
  if (!effectiveOn) {
    await admin.from("worker_current_docs").delete().eq("worker_id", workerId).eq("kind", kind);
  }
  return { ok: true };
}

// 在留カード・指定書の「追加した期間」（在籍期間のタブにない期間。0197）
export interface WorkerDocPeriodView {
  id: string;
  label: string; // 期間の名前（空でもよい）
  startOn: string; // 開始日
  endOn: string | null; // 終了日（未定なら null）
  isCurrent: boolean; // 「現在」のタブにする期間か（0199。1人につき1つ）
}

export async function listWorkerDocPeriods(workerId: string): Promise<WorkerDocPeriodView[]> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return [];
  // is_current（0199）が未適用でも読めるよう select("*") にして、無ければ false 扱い
  const { data } = await admin
    .from("worker_document_periods")
    .select("*")
    .eq("worker_id", workerId)
    .order("start_on", { ascending: false });
  return (
    (data as
      | { id: string; label: string; start_on: string; end_on: string | null; is_current?: boolean | null }[]
      | null) ?? []
  ).map((r) => ({
    id: r.id,
    label: r.label ?? "",
    startOn: r.start_on,
    endOn: r.end_on ?? null,
    isCurrent: r.is_current === true,
  }));
}

// 「現在」の期間を選ぶ（periodId が null なら現在の指定を外す）。1人につき1つなので、他の期間は外す
export async function setWorkerDocPeriodCurrent(
  workerId: string,
  periodId: string | null,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error: clearErr } = await admin
    .from("worker_document_periods")
    .update({ is_current: false })
    .eq("worker_id", workerId);
  if (clearErr) {
    return { ok: false, message: dbErrorMessage(clearErr, "0199_worker_document_period_current.sql", "保存に失敗しました") };
  }
  if (periodId) {
    const { error } = await admin
      .from("worker_document_periods")
      .update({ is_current: true })
      .eq("id", periodId)
      .eq("worker_id", workerId);
    if (error) {
      return { ok: false, message: dbErrorMessage(error, "0199_worker_document_period_current.sql", "保存に失敗しました") };
    }
  }
  return { ok: true };
}

// 期間の追加・編集（id があれば編集）
export async function saveWorkerDocPeriod(
  workerId: string,
  input: { id?: string | null; label: string; startOn: string; endOn: string | null },
): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const startOn = input.startOn.trim();
  const endOn = (input.endOn ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn)) return { ok: false, message: "開始日を入れてください" };
  if (endOn && !/^\d{4}-\d{2}-\d{2}$/.test(endOn)) return { ok: false, message: "終了日の形式が正しくありません" };
  if (endOn && endOn < startOn) return { ok: false, message: "終了日は開始日より後にしてください" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const row = { label: input.label.trim(), start_on: startOn, end_on: endOn };
  if (input.id) {
    const { error } = await admin
      .from("worker_document_periods")
      .update(row)
      .eq("id", input.id)
      .eq("worker_id", workerId);
    if (error) {
      return { ok: false, message: dbErrorMessage(error, "0197_worker_document_periods.sql", "保存に失敗しました") };
    }
    return { ok: true, id: input.id };
  }
  const { data, error } = await admin
    .from("worker_document_periods")
    .insert({ worker_id: workerId, ...row })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: dbErrorMessage(error, "0197_worker_document_periods.sql", "保存に失敗しました") };
  }
  return { ok: true, id: (data as { id: string }).id };
}

// 期間の削除。登録した画像は消えず（period_id が null になる）、日付で元の在籍期間または「現在」に振り分けられる
export async function deleteWorkerDocPeriod(periodId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("worker_document_periods").delete().eq("id", periodId);
  if (error) return { ok: false, message: error.message };
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

  // 申請登録時の画像（listWorkerDocs が app-<application_files.id> で返す分）は、申請の添付ファイルを消す
  // （申請詳細の許可情報からも消える。履歴から外したいだけのときも、実体はここにしか無いので削除になる）
  if (docId.startsWith("app-")) {
    const fileId = docId.slice(4);
    const { data: f } = await admin
      .from("application_files")
      .select("storage_path")
      .eq("id", fileId)
      .maybeSingle();
    const filePath = (f as { storage_path: string } | null)?.storage_path;
    if (filePath) await admin.storage.from(BUCKET).remove([filePath]).catch(() => undefined);
    const { error } = await admin.from("application_files").delete().eq("id", fileId);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

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

export interface WorkerDocView {
  id: string;
  kind: WorkerDocKind;
  url: string;
  downloadUrl?: string; // ダウンロード用の予備（署名付きURLの download 指定。日本語名が壊れるため通常は使わない）
  fileName?: string;
  downloadName?: string; // ダウンロード時の名前（氏名_書類名.拡張子）
  mimeType?: string;
  organizationId?: string | null; // 雇用契約書・雇用条件書の所属機関（0081）
  effectiveOn?: string | null; // いつ時点の書類か（過去の在籍期間への登録用・0100）
  periodId?: string | null; // 自分で追加した期間のID（0197）。あればその期間のタブに出す
  createdAt: string;
  fromApplication?: boolean; // 申請登録時の画像（差し替え前の現データ）
  externalUrl?: string; // Google ドライブなどのリンクで登録した書類（0155）。ファイルの実体は無い
  currentSelected?: boolean; // 手で選んだ「現在の画像」（0210）。個人票などにこの画像が出る
}

// 雇用契約書・雇用条件書を Google ドライブなどのリンクで登録する（ストレージは使わない・0155）
export async function registerWorkerDocLink(
  workerId: string,
  kind: WorkerDocKind,
  url: string,
  organizationId?: string | null,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, message: "リンクの形が正しくありません（https:// から始まるURLを貼ってください）" };
  }
  if (parsed.protocol !== "https:") return { ok: false, message: "https:// から始まるリンクだけ登録できます" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const isDrive = /(^|\.)(drive|docs)\.google\.com$/.test(parsed.hostname);
  const { error } = await admin.from("worker_documents").insert({
    worker_id: workerId,
    kind,
    storage_path: "",
    file_name: isDrive ? "Google ドライブ" : parsed.hostname,
    mime_type: "text/uri-list",
    external_url: trimmed,
    ...(organizationId ? { organization_id: organizationId } : {}),
  });
  if (error) {
    return {
      ok: false,
      message: dbErrorMessage(error, "0155_worker_documents_external_url.sql", "リンクの登録に失敗しました"),
    };
  }
  return { ok: true };
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
      period_id?: string | null;
      external_url?: string | null;
      created_at: string;
    }[]) ?? [];

  const result: WorkerDocView[] = [];
  if (rows.length > 0) {
    // リンクで登録した行（storage_path が空）には署名付きURLを作らない
    const paths = rows.map((r) => r.storage_path).filter(Boolean);
    const pathIndex = new Map(paths.map((p, i) => [p, i]));

    // ダウンロードしたときのファイル名を「氏名_書類名」にするため、外国人の氏名を引く
    const { data: w } = await admin
      .from("workers")
      .select("name")
      .eq("id", workerId)
      .maybeSingle();
    const workerName = (w as { name: string } | null)?.name ?? "";

    // 表示用（そのまま開く）と、予備のファイル保存用の署名付きURLを作る
    // （保存時の名前付けは画面側で行う。downloadFileAs を参照）
    const downloadNames = rows.map((r) => workerDocFileName(workerName, r.kind, r.file_name));
    const [{ data: signed }, signedDl] = await Promise.all([
      paths.length > 0 ? admin.storage.from(BUCKET).createSignedUrls(paths, TTL) : Promise.resolve({ data: null }),
      Promise.all(
        rows.map((r, i) =>
          r.storage_path
            ? admin.storage
                .from(BUCKET)
                .createSignedUrl(r.storage_path, TTL, { download: downloadNames[i] })
                .then((res) => res.data?.signedUrl ?? "")
            : Promise.resolve(""),
        ),
      ),
    ]);
    rows.forEach((r, i) => {
      const external = (r.external_url ?? "").trim();
      const si = r.storage_path ? pathIndex.get(r.storage_path) : undefined;
      result.push({
        id: r.id,
        kind: r.kind,
        // リンクで登録した書類はそのリンクをそのまま開く
        url: external || (si != null ? (signed?.[si]?.signedUrl ?? "") : ""),
        downloadUrl: external ? "" : (signedDl[i] ?? ""),
        fileName: r.file_name,
        downloadName: external ? "" : downloadNames[i],
        mimeType: r.mime_type,
        organizationId: r.organization_id ?? null,
        effectiveOn: r.effective_on ?? null,
        periodId: r.period_id ?? null,
        createdAt: r.created_at,
        ...(external ? { externalUrl: external } : {}),
      });
    });
  }

  // 申請詳細の許可情報で登録した在留カード・照合結果・指定書（application_files）も、
  // この人の全申請ぶんを履歴に含める（申請詳細と外国人詳細のどちらで登録しても同じものが見えるようにする）。
  // 登録日で在籍期間のタブに振り分けられ、いちばん新しいものが「現在」の画像になる
  const { data: apps } = await admin
    .from("immigration_applications")
    .select("id")
    .eq("worker_id", workerId);
  const appIds = ((apps as { id: string }[]) ?? []).map((a) => a.id);
  if (appIds.length > 0) {
    const { data: files } = await admin
      .from("application_files")
      .select("id, kind, storage_path, file_name, created_at")
      .in("application_id", appIds)
      .in("kind", ["在留カード", "照合結果", "指定書"])
      .order("created_at", { ascending: false });
    const appFiles =
      (files as { id: string; kind: WorkerDocKind; storage_path: string; file_name: string; created_at: string }[] | null) ?? [];
    if (appFiles.length > 0) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(appFiles.map((f) => f.storage_path), TTL);
      appFiles.forEach((f, i) => {
        result.push({
          id: `app-${f.id}`,
          kind: f.kind,
          url: signed?.[i]?.signedUrl ?? "",
          fileName: f.file_name,
          createdAt: f.created_at,
          fromApplication: true,
        });
      });
    }
  }

  // 登録の新しい順（外国人詳細で登録した画像と申請の画像を一緒に並べる）
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // 手で選んだ「現在の画像」（0210）に印を付ける（未適用の環境では無いものとして進む）
  const { data: selections } = await admin
    .from("worker_current_docs")
    .select("kind, worker_document_id, application_file_id")
    .eq("worker_id", workerId);
  for (const s of (selections as
    | { kind: string; worker_document_id: string | null; application_file_id: string | null }[]
    | null) ?? []) {
    const id = s.worker_document_id ?? (s.application_file_id ? `app-${s.application_file_id}` : null);
    const hit = id ? result.find((r) => r.id === id && r.kind === s.kind) : undefined;
    if (hit) hit.currentSelected = true;
  }
  return result;
}

// 個人票などに出す「現在」の画像を手で選ぶ（0210）。viewId は listWorkerDocs の id
// （worker_documents のID、申請登録時の画像は app-<application_files.id>）。
// viewId が null なら選択を外して自動（いちばん新しい画像）に戻す
export async function setWorkerCurrentDoc(
  workerId: string,
  kind: "在留カード" | "照合結果" | "指定書",
  viewId: string | null,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  if (!viewId) {
    const { error } = await admin
      .from("worker_current_docs")
      .delete()
      .eq("worker_id", workerId)
      .eq("kind", kind);
    if (error) {
      return { ok: false, message: dbErrorMessage(error, "0210_worker_current_docs.sql", "解除に失敗しました") };
    }
    return { ok: true };
  }

  let row: {
    worker_id: string;
    kind: string;
    worker_document_id: string | null;
    application_file_id: string | null;
  };
  if (viewId.startsWith("app-")) {
    // 申請登録時の画像。本人の申請のファイルかを確かめてから保存する
    const fileId = viewId.slice(4);
    const { data: f } = await admin
      .from("application_files")
      .select("id, kind, application_id")
      .eq("id", fileId)
      .maybeSingle();
    const file = f as { id: string; kind: string; application_id: string } | null;
    if (!file || file.kind !== kind) return { ok: false, message: "画像が見つかりません" };
    const { data: app } = await admin
      .from("immigration_applications")
      .select("worker_id")
      .eq("id", file.application_id)
      .maybeSingle();
    if ((app as { worker_id: string } | null)?.worker_id !== workerId) {
      return { ok: false, message: "画像が見つかりません" };
    }
    row = { worker_id: workerId, kind, worker_document_id: null, application_file_id: fileId };
  } else {
    const { data: d } = await admin
      .from("worker_documents")
      .select("id")
      .eq("id", viewId)
      .eq("worker_id", workerId)
      .eq("kind", kind)
      .maybeSingle();
    if (!d) return { ok: false, message: "画像が見つかりません" };
    row = { worker_id: workerId, kind, worker_document_id: viewId, application_file_id: null };
  }
  const { error } = await admin
    .from("worker_current_docs")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "worker_id,kind" });
  if (error) {
    return { ok: false, message: dbErrorMessage(error, "0210_worker_current_docs.sql", "保存に失敗しました") };
  }
  return { ok: true };
}

// 「現在」の画像（個人票などに出す1枚）の中身。外国人詳細の「現在」タブの表示と合わせる
interface CurrentDocRow {
  storage_path: string;
  mime_type: string | null;
  external_url: string | null;
  created_at: string;
  fromApplication: boolean;
}

// 「現在」の在留カード・照合結果・指定書を1件決める。
// 手で選んだ画像（worker_current_docs・0210）があればそれを最優先。
// 無ければ、外国人詳細の「現在」タブと同じ考え方で、
// 「現在」に出る画像（worker_documents のうち過去の期間に振り分けていないもの＋申請登録時の
// application_files）を「いつ時点の書類か」の新しい順に並べて、いちばん新しいものを返す。
// （以前は worker_documents を一律で優先していたため、申請の許可情報で新しい在留カードを
// 登録しても、昔に外国人詳細で登録した画像が個人票に出続けることがあった）
async function currentDocRowFor(
  admin: Admin,
  workerId: string,
  kind: string,
): Promise<CurrentDocRow | null> {
  // 手で選んだ「現在の画像」（0210 未適用の環境では無いものとして自動選択に進む）
  const { data: sel } = await admin
    .from("worker_current_docs")
    .select("worker_document_id, application_file_id")
    .eq("worker_id", workerId)
    .eq("kind", kind)
    .maybeSingle();
  const s = sel as { worker_document_id: string | null; application_file_id: string | null } | null;
  if (s?.worker_document_id) {
    const { data } = await admin
      .from("worker_documents")
      .select("storage_path, mime_type, external_url, created_at")
      .eq("id", s.worker_document_id)
      .maybeSingle();
    const d = data as Omit<CurrentDocRow, "fromApplication"> | null;
    if (d) return { ...d, fromApplication: false };
  } else if (s?.application_file_id) {
    const { data } = await admin
      .from("application_files")
      .select("storage_path, created_at")
      .eq("id", s.application_file_id)
      .maybeSingle();
    const d = data as { storage_path: string; created_at: string } | null;
    if (d) return { ...d, mime_type: null, external_url: null, fromApplication: true };
  }

  // 「現在」にした期間（0199）。その期間に結び付いた画像は「現在」の候補に入れる
  const { data: currentPeriod } = await admin
    .from("worker_document_periods")
    .select("id")
    .eq("worker_id", workerId)
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  const currentPeriodId = (currentPeriod as { id: string } | null)?.id ?? null;

  const { data: docsData } = await admin
    .from("worker_documents")
    .select("storage_path, mime_type, external_url, effective_on, period_id, created_at")
    .eq("worker_id", workerId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  const docRows = (
    (docsData as
      | {
          storage_path: string;
          mime_type: string | null;
          external_url: string | null;
          effective_on: string | null;
          period_id?: string | null;
          created_at: string;
        }[]
      | null) ?? []
  ).filter(
    (r) =>
      // リンク登録（実体の無い行）は個人票に出せないので候補にしない
      !(r.external_url ?? "").trim() &&
      // 追加した期間に結び付いた画像はその期間が「現在」のときだけ。
      // それ以外は過去の期間に振り分けていないもの（effective_on が空）だけ
      (r.period_id ? r.period_id === currentPeriodId : !r.effective_on),
  );

  const { data: apps } = await admin
    .from("immigration_applications")
    .select("id")
    .eq("worker_id", workerId);
  const appIds = ((apps as { id: string }[]) ?? []).map((a) => a.id);
  let appRows: { storage_path: string; created_at: string }[] = [];
  if (appIds.length > 0) {
    const { data: files } = await admin
      .from("application_files")
      .select("storage_path, created_at")
      .in("application_id", appIds)
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    appRows = (files as { storage_path: string; created_at: string }[] | null) ?? [];
  }

  // 「いつ時点の書類か」（effective_on または登録日）の新しい順で、いちばん新しい1件
  const candidates = [
    ...docRows.map((r) => ({
      effectiveOn: r.effective_on,
      createdAt: r.created_at,
      row: {
        storage_path: r.storage_path,
        mime_type: r.mime_type,
        external_url: null,
        created_at: r.created_at,
        fromApplication: false,
      } satisfies CurrentDocRow,
    })),
    ...appRows.map((r) => ({
      effectiveOn: null,
      createdAt: r.created_at,
      row: {
        storage_path: r.storage_path,
        mime_type: null,
        external_url: null,
        created_at: r.created_at,
        fromApplication: true,
      } satisfies CurrentDocRow,
    })),
  ];
  return sortDocsByPeriodDate(candidates)[0]?.row ?? null;
}

// 外国人の「現在」の在留カード画像・指定書画像の署名付きURL（個人票などに出す画像）。
// 手で選んだ画像（0210）があればそれ、無ければいちばん新しい画像
export async function getWorkerLatestDocUrls(
  workerId: string,
): Promise<{ residenceCardUrl: string; designationUrl: string }> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { residenceCardUrl: "", designationUrl: "" };

  async function urlFor(kind: string): Promise<string> {
    const row = await currentDocRowFor(admin!, workerId, kind);
    if (!row?.storage_path) return "";
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(row.storage_path, TTL);
    return data?.signedUrl ?? "";
  }

  return {
    residenceCardUrl: await urlFor("在留カード"),
    designationUrl: await urlFor("指定書"),
  };
}

// 印刷用に、外国人の現在の在留カード（いちばん新しいもの）を1件返す。
// worker_documents を優先し、無ければ申請の application_files。PDFか画像かも返す
export interface CurrentResidenceCard {
  url: string;
  isPdf: boolean;
  createdAt: string;
  fromApplication: boolean;
}

export async function getCurrentResidenceCard(workerId: string): Promise<CurrentResidenceCard | null> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return null;

  const isPdfPath = (path: string, mime?: string | null) =>
    mime === "application/pdf" || /\.pdf$/i.test(path);

  // 手で選んだ画像（0210）があればそれ、無ければいちばん新しい画像（個人票と同じ決め方）
  const row = await currentDocRowFor(admin, workerId, "在留カード");
  if (!row) return null;
  const external = (row.external_url ?? "").trim();
  if (external) return { url: external, isPdf: true, createdAt: row.created_at, fromApplication: row.fromApplication };
  if (!row.storage_path) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, TTL);
  if (!data?.signedUrl) return null;
  return {
    url: data.signedUrl,
    isPdf: isPdfPath(row.storage_path, row.mime_type),
    createdAt: row.created_at,
    fromApplication: row.fromApplication,
  };
}
