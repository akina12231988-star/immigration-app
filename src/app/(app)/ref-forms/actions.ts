"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { isMissingColumnError, isMissingTableError } from "@/lib/errors";
import {
  BUNDLED_REF_FORMS,
  REF_FORM_LANGUAGES,
  REF_FORM_MIGRATION,
  isRefFormKey,
  CUSTOM_REF_FORMS_SETTING,
  isCustomRefFormKey,
  normalizeCustomRefForms,
  refFormPrepKeys,
  type CustomRefForm,
  normalizeRefFormLayout,
  normalizeSignPages,
  refFormName,
} from "@/lib/ref-form";

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

const validKey = (k: string) => isRefFormKey(k);
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
      // 列が無い（0228 未適用）を先に見る。列が無いときの文面（column ... does not exist）は
      // 表が無いときの判定にも当たってしまうため
      message: isMissingColumnError(readErr)
        ? `${ORG_HINT}（${readErr.message}）`
        : isMissingTableError(readErr)
          ? `${HINT}（${readErr.message}）`
          : readErr.message,
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

// アプリに入れてある入管の参考様式（public/forms/ref-forms/）を、全員共通・日本語のひな形として登録する。
// すでに全員共通・日本語のひな形がある様式は飛ばす（差し替えない）。登録した件数を返す
export async function registerBundledRefForms(keys: string[]): Promise<{ ok: true; added: string[] } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー（SERVICE_ROLE_KEY 未設定）" };
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
  const added: string[] = [];
  for (const key of keys) {
    const file = BUNDLED_REF_FORMS[key];
    if (!file) continue;
    // 全員共通（所属機関なし）の日本語の版がもうあれば登録しない。所属機関別の列（0228）が無い環境でも読めるようにする
    const base = admin.from("ref_form_templates").select("id").eq("form_key", key).eq("language", "日本語");
    let found = await base.is("organization_id", null).limit(1);
    if (found.error && isMissingColumnError(found.error)) {
      found = await admin.from("ref_form_templates").select("id").eq("form_key", key).eq("language", "日本語").limit(1);
    }
    if (found.error) return { ok: false, message: isMissingTableError(found.error) ? HINT : found.error.message };
    if ((found.data ?? []).length > 0) continue;
    const bytes = await readFile(path.join(process.cwd(), "public", "forms", "ref-forms", file));
    const storagePath = `ref-forms/${key}/${crypto.randomUUID()}.pdf`;
    const up = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf" });
    if (up.error) return { ok: false, message: `アップロードに失敗: ${up.error.message}` };
    const ins = await admin
      .from("ref_form_templates")
      .insert({ form_key: key, language: "日本語", pdf_path: storagePath, pdf_name: `${refFormName(key)}（入管の様式・未記入）.pdf` });
    if (ins.error) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
      return { ok: false, message: ins.error.message };
    }
    added.push(key);
  }
  return { ok: true, added };
}

// ---- 追加した参考様式（提出書類一覧表にまだ無い様式。app_settings の custom_ref_forms） ----

async function readCustomRefForms(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<CustomRefForm[]> {
  const { data } = await admin.from("app_settings").select("value").eq("key", CUSTOM_REF_FORMS_SETTING).maybeSingle();
  return normalizeCustomRefForms((data as { value: unknown } | null)?.value);
}
async function writeCustomRefForms(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  forms: CustomRefForm[],
): Promise<string | null> {
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: CUSTOM_REF_FORMS_SETTING, value: { forms } }, { onConflict: "key" });
  return error ? error.message : null;
}

// 参考様式を追加する（名前・書類名・所属機関別か）。ひな形はこのあと、ひな形の画面で登録する
export async function addCustomRefForm(input: {
  name: string;
  label: string;
  orgSpecific: boolean;
}): Promise<{ ok: true; form: CustomRefForm } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, message: "様式の名前を入れてください（例: 参考様式第1-10号）" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const forms = await readCustomRefForms(admin);
  const form: CustomRefForm = {
    key: `custom-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name,
    label: input.label.trim().slice(0, 200),
    orgSpecific: !!input.orgSpecific,
    created_at: new Date().toISOString(),
  };
  const err = await writeCustomRefForms(admin, [...forms, form]);
  if (err) return { ok: false, message: err };
  return { ok: true, form };
}

// 追加した参考様式を消す（ひな形が残っているときは消さない）
export async function deleteCustomRefForm(key: string): Promise<{ ok: true } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  if (!isCustomRefFormKey(key)) return { ok: false, message: "不正な様式です" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const { count } = await admin.from("ref_form_templates").select("id", { count: "exact", head: true }).eq("form_key", key);
  if ((count ?? 0) > 0) return { ok: false, message: "ひな形が登録されています。先にひな形の画面で削除してください。" };
  const forms = await readCustomRefForms(admin);
  const err = await writeCustomRefForms(admin, forms.filter((f) => f.key !== key));
  return err ? { ok: false, message: err } : { ok: true };
}

// 追加した参考様式を、提出書類一覧表の行（1号のキー）に紐づける。
// ひな形（言語・所属機関ごと）をその行のキーへ移し、追加した様式の一覧から外す。
// 行の側に同じ言語・同じ登録先のひな形があるときは移さずに知らせる
export async function linkCustomRefForm(key: string, targetKey: string): Promise<{ ok: true; moved: number } | Err> {
  if (!(await requireAdmin())) return { ok: false, message: "権限がありません（管理者だけ）" };
  if (!isCustomRefFormKey(key) || !refFormPrepKeys().includes(targetKey)) return { ok: false, message: "不正な様式です" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const cols = "id, language, organization_id";
  const [{ data: mine, error: e1 }, { data: theirs, error: e2 }] = await Promise.all([
    admin.from("ref_form_templates").select(cols).eq("form_key", key),
    admin.from("ref_form_templates").select(cols).eq("form_key", targetKey),
  ]);
  if (e1 || e2) return { ok: false, message: (e1 ?? e2)!.message };
  type Row = { id: string; language: string; organization_id: string | null };
  const scope = (r: Row) => `${r.language}:${r.organization_id ?? ""}`;
  const taken = new Set(((theirs as Row[] | null) ?? []).map(scope));
  const clash = ((mine as Row[] | null) ?? []).filter((r) => taken.has(scope(r)));
  if (clash.length > 0) {
    return {
      ok: false,
      message: `紐づける先に同じ言語・同じ登録先のひな形があります（${clash
        .map((r) => `${r.language}${r.organization_id ? "・所属機関の版" : "・全員共通"}`)
        .join("、")}）。どちらかをひな形の画面で削除してから紐づけてください。`,
    };
  }
  const ids = ((mine as Row[] | null) ?? []).map((r) => r.id);
  if (ids.length > 0) {
    const { error } = await admin.from("ref_form_templates").update({ form_key: targetKey }).in("id", ids);
    if (error) return { ok: false, message: error.message };
  }
  const forms = await readCustomRefForms(admin);
  const err = await writeCustomRefForms(admin, forms.filter((f) => f.key !== key));
  if (err) return { ok: false, message: err };
  return { ok: true, moved: ids.length };
}
