"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { INSURANCE_KINDS } from "@/lib/insurance-card";

// 保険証（健康保険）の記録（0129）。
// 画像は非公開バケット app-files（insurance-cards/）に保存し、署名付きURLで
// アップロード・表示する（パスポートの添付 passport-file-actions.ts と同じ方式）。
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

function normalizeKindInput(input: {
  kind: string;
  kindNote: string;
  workHistoryId: string | null;
}): { kind: string; kind_note: string; work_history_id: string | null } | Err {
  const kind = input.kind.trim();
  if (kind && !(INSURANCE_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, message: "保険証の種類が正しくありません" };
  }
  return {
    kind,
    // 内容・職歴の紐付けは、その種類のときだけ保存する（切り替えたときの残りかすを消す）
    kind_note: kind === "その他" ? input.kindNote.trim() : "",
    work_history_id: kind === "社保" ? input.workHistoryId : null,
  };
}

// アップロード用の署名付きURLを発行
export async function createInsuranceCardTicket(
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
  const path = `insurance-cards/${workerId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// 新しい保険証として登録する（この行が「現在の保険証」になる）。
// path が空なら画像なしで種類だけ記録する
export async function registerInsuranceCard(
  workerId: string,
  input: {
    kind: string;
    kindNote: string;
    workHistoryId: string | null;
    path: string;
    fileName: string;
    mimeType: string;
  },
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (input.path && !input.path.startsWith(`insurance-cards/${workerId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const kindFields = normalizeKindInput(input);
  if ("ok" in kindFields) return kindFields;
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin.from("worker_insurance_cards").insert({
    worker_id: workerId,
    ...kindFields,
    storage_path: input.path,
    file_name: input.path ? input.fileName : "",
    mime_type: input.path ? input.mimeType : "",
    uploaded_by: me?.id ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 保険証の種類・内容・職歴の紐付けを直す（画像はそのまま）
export async function updateInsuranceCardKind(
  cardId: string,
  input: { kind: string; kindNote: string; workHistoryId: string | null },
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const kindFields = normalizeKindInput(input);
  if ("ok" in kindFields) return kindFields;
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin
    .from("worker_insurance_cards")
    .update(kindFields)
    .eq("id", cardId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 画像なしで登録済みの行に、あとから画像を付ける（付け直しにも使う。前の実体は消す）
export async function attachInsuranceCardFile(
  workerId: string,
  cardId: string,
  path: string,
  fileName: string,
  mimeType: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`insurance-cards/${workerId}/`)) {
    return { ok: false, message: "不正なパス" };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("worker_insurance_cards")
    .select("storage_path, worker_id")
    .eq("id", cardId)
    .maybeSingle();
  const row = data as { storage_path: string; worker_id: string } | null;
  if (!row || row.worker_id !== workerId) return { ok: false, message: "記録が見つかりません" };
  if (row.storage_path) {
    await admin.storage.from(BUCKET).remove([row.storage_path]).catch(() => undefined);
  }
  const { error } = await admin
    .from("worker_insurance_cards")
    .update({ storage_path: path, file_name: fileName, mime_type: mimeType })
    .eq("id", cardId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// 表示用の署名付きURL
export async function getInsuranceCardPreviewUrl(
  cardId: string,
): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  const admin = createAdminClient();
  if (!me || !admin) return { ok: false, message: "権限がありません" };
  const { data } = await admin
    .from("worker_insurance_cards")
    .select("storage_path")
    .eq("id", cardId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (!path) return { ok: false, message: "画像がありません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URL発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

// 記録の削除（ストレージの実体も消す）
export async function deleteInsuranceCard(cardId: string): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin
    .from("worker_insurance_cards")
    .select("storage_path")
    .eq("id", cardId)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  const { error } = await admin.from("worker_insurance_cards").delete().eq("id", cardId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
