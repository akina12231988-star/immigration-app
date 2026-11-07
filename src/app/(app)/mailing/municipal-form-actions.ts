"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { isMissingColumnError } from "@/lib/errors";
import { MUNICIPAL_FORM_DOCS, parseMunicipalFormDoc, type MunicipalFormDoc } from "@/lib/municipal-form";

// 自治体マスタの申請書（課税・納税証明書の交付請求書）・委任状のPDF。
// 非公開バケット app-files の municipal-forms/{自治体ID}/ に保存し、署名付きURLでアップロード・表示する
const BUCKET = "app-files";
const TTL = 60 * 60;
const MIGRATION_HINT = "マイグレーション 0215_municipality_cert_form_pdf.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。";

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export async function createMunicipalFormTicket(
  municipalityId: string,
  mimeType: string,
  docArg: MunicipalFormDoc = "cert",
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (mimeType !== "application/pdf") return { ok: false, message: "PDFのみ登録できます" };
  if (!/^[0-9a-f-]{36}$/i.test(municipalityId)) return { ok: false, message: "不正な自治体です" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const doc = parseMunicipalFormDoc(docArg);
  const path = `municipal-forms/${municipalityId}/${doc}-${crypto.randomUUID()}.pdf`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードが終わったら自治体マスタに保存する（前のPDFは消す。記入位置はそのまま残す）
export async function registerMunicipalFormPdf(
  municipalityId: string,
  path: string,
  fileName: string,
  docArg: MunicipalFormDoc = "cert",
): Promise<{ ok: true } | Err> {
  const cols = MUNICIPAL_FORM_DOCS[parseMunicipalFormDoc(docArg)];
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  if (!path.startsWith(`municipal-forms/${municipalityId}/`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data: before } = await admin.from("municipalities").select(cols.pathCol).eq("id", municipalityId).maybeSingle();
  const { error } = await admin
    .from("municipalities")
    .update({ [cols.pathCol]: path, [cols.nameCol]: fileName.slice(0, 200) })
    .eq("id", municipalityId);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return { ok: false, message: isMissingColumnError(error) ? `保存に失敗しました／${MIGRATION_HINT}` : `保存に失敗しました: ${error.message}` };
  }
  const old = (before as Record<string, string> | null)?.[cols.pathCol];
  if (old && old !== path) await admin.storage.from(BUCKET).remove([old]).catch(() => undefined);
  return { ok: true };
}

// 記入位置の画面でPDFを表示するための署名付きURL
export async function getMunicipalFormPdfUrl(
  municipalityId: string,
  docArg: MunicipalFormDoc = "cert",
): Promise<{ ok: true; url: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const cols = MUNICIPAL_FORM_DOCS[parseMunicipalFormDoc(docArg)];
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data, error: e1 } = await admin.from("municipalities").select(cols.pathCol).eq("id", municipalityId).maybeSingle();
  if (e1) return { ok: false, message: isMissingColumnError(e1) ? MIGRATION_HINT : e1.message };
  const path = (data as Record<string, string> | null)?.[cols.pathCol];
  if (!path) return { ok: false, message: "PDFが登録されていません" };
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(path, TTL);
  if (error || !signed) return { ok: false, message: `URLの発行に失敗: ${error?.message}` };
  return { ok: true, url: signed.signedUrl };
}

// 申請書PDFを外す（記入位置も消す）
export async function removeMunicipalFormPdf(
  municipalityId: string,
  docArg: MunicipalFormDoc = "cert",
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const cols = MUNICIPAL_FORM_DOCS[parseMunicipalFormDoc(docArg)];
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin.from("municipalities").select(cols.pathCol).eq("id", municipalityId).maybeSingle();
  const path = (data as Record<string, string> | null)?.[cols.pathCol];
  const { error } = await admin
    .from("municipalities")
    .update({ [cols.pathCol]: "", [cols.nameCol]: "", [cols.layoutCol]: [] })
    .eq("id", municipalityId);
  if (error) return { ok: false, message: error.message };
  if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
  return { ok: true };
}
