"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { isMissingColumnError, isMissingTableError } from "@/lib/errors";
import { REF_FORM_ITEMS, REF_FORM_LANGUAGES, REF_FORM_MIGRATION, normalizeRefFormLayout, normalizeSignPages } from "@/lib/ref-form";

// 参考様式のひな形PDF（ref_form_templates。0227）。非公開バケット app-files の ref-forms/ に置く。
// 試験中（申請書類作成をアプリ一本化計画）なので、登録・変更・削除は管理者だけ
const BUCKET = "app-files";
const TTL = 60 * 60;
const HINT = `マイグレーション ${REF_FORM_MIGRATION} が未適用の可能性があります。Supabase の SQL Editor で適用してください。`;

interface Err {
  ok: false;
  message: string;
}

async function requireAdmin(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role === "admin";
}

const validKey = (k: string) => REF_FORM_ITEMS.some((i) => i.key === k);
const validLang = (l: string) => (REF_FORM_LANGUAGES as readonly string[]).includes(l);
const validOrg = (o: string | null) => o == null || /^[0-9a-f-]{36}$/i.test(o);
const ORG_HINT = "マイグレーション 0228_ref_form_templates_org.sql が未適用の可能性があります。Supabase の SQL Editor で適用してください。";

export async function createRefFormTicket(
  formKey: string,
  language: string,
  mimeType: string,
): Promise<{ ok: true; path: string; token: string } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  if (mimeType !== "application/pdf") return { ok: false, message: "PDFのみ登録できます" };
  if (!validKey(formKey) || !validLang(language)) return { ok: false, message: "不正な様式・言語です" };
  // 所属機関別の版も同じ場所に置く（どの所属機関の版かは表の organization_id で持つ）
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const path = `ref-forms/${formKey}/${crypto.randomUUID()}.pdf`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `準備に失敗: ${error?.message}` };
  return { ok: true, path, token: data.token };
}

// アップロードしたPDFを登録する（同じ様式・言語・所属機関があれば差し替え。記入位置・署名ページはそのまま残す）。
// orgId を渡すとその所属機関だけの版、null は全員共通の版
export async function registerRefFormPdf(
  formKey: string,
  language: string,
  path: string,
  fileName: string,
  orgId: string | null = null,
): Promise<{ ok: true; id: string } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  if (!validKey(formKey) || !validLang(language) || !validOrg(orgId)) return { ok: false, message: "不正な様式・言語・所属機関です" };
  if (!path.startsWith(`ref-forms/${formKey}/`)) return { ok: false, message: "不正なパス" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const base = admin.from("ref_form_templates").select("id, pdf_path").eq("form_key", formKey).eq("language", language);
  const { data: before, error: readErr } = await (orgId ? base.eq("organization_id", orgId) : base.is("organization_id", null)).maybeSingle();
  if (readErr) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return {
      ok: false,
      message: isMissingTableError(readErr) ? HINT : isMissingColumnError(readErr) ? ORG_HINT : readErr.message,
    };
  }
  const prev = before as { id: string; pdf_path: string } | null;
  const res = prev
    ? await admin.from("ref_form_templates").update({ pdf_path: path, pdf_name: fileName.slice(0, 200) }).eq("id", prev.id).select("id").single()
    : await admin
        .from("ref_form_templates")
        .insert({ form_key: formKey, language, organization_id: orgId, pdf_path: path, pdf_name: fileName.slice(0, 200) })
        .select("id")
        .single();
  if (res.error || !res.data) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return { ok: false, message: res.error?.message ?? "登録に失敗しました" };
  }
  if (prev?.pdf_path && prev.pdf_path !== path) await admin.storage.from(BUCKET).remove([prev.pdf_path]).catch(() => undefined);
  return { ok: true, id: (res.data as { id: string }).id };
}

export async function getRefFormPdfUrl(id: string): Promise<{ ok: true; url: string } | Err> {
  const me = await getMyProfile();
  if (!me) return { ok: false, message: "ログインが必要です" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin.from("ref_form_templates").select("pdf_path").eq("id", id).maybeSingle();
  const p = (data as { pdf_path: string } | null)?.pdf_path;
  if (!p) return { ok: false, message: "ひな形が見つかりません" };
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(p, TTL);
  return signed?.signedUrl ? { ok: true, url: signed.signedUrl } : { ok: false, message: "PDFを開けませんでした" };
}

// 記入位置と署名ページを保存する
export async function saveRefFormLayout(id: string, layout: unknown, signPages: unknown): Promise<{ ok: true } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { error } = await admin
    .from("ref_form_templates")
    .update({ layout: normalizeRefFormLayout(layout), sign_pages: normalizeSignPages(signPages) })
    .eq("id", id);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function deleteRefFormTemplate(id: string): Promise<{ ok: true } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { data } = await admin.from("ref_form_templates").select("pdf_path").eq("id", id).maybeSingle();
  const { error } = await admin.from("ref_form_templates").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  const p = (data as { pdf_path: string } | null)?.pdf_path;
  if (p) await admin.storage.from(BUCKET).remove([p]).catch(() => undefined);
  return { ok: true };
}
