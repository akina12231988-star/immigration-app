"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, PenLine, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  REF_FORM_LANGUAGES,
  REF_FORM_MIGRATION,
  languageForNationality,
  normalizeSignPages,
  pickRefFormTemplate,
  refFormName,
  type RefFormMode,
  type RefFormTemplate,
} from "@/lib/ref-form";
import { createRefFormTicket, deleteRefFormTemplate, registerRefFormPdf } from "@/app/(app)/ref-forms/actions";
import { RefFormLayoutEditor } from "./RefFormLayoutEditor";

// 参考様式のひな形（ref_form_templates。0227）を読む
export function useRefFormTemplates() {
  const [templates, setTemplates] = useState<RefFormTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error: err } = await createClient()
      .from("ref_form_templates")
      .select("id, form_key, language, pdf_path, pdf_name, layout, sign_pages, updated_at")
      .order("language");
    if (err) {
      setError(dbErrorMessage(err, REF_FORM_MIGRATION, "参考様式のひな形を読めませんでした"));
      return;
    }
    setError(null);
    setTemplates(((data as RefFormTemplate[] | null) ?? []).map((t) => ({ ...t, sign_pages: normalizeSignPages(t.sign_pages) })));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);
  return { templates, error, reload };
}

// PDFを作るリンク（新しいタブで開く）
export function refFormHref(workerId: string, keys: string[], mode: RefFormMode): string {
  return `/api/ref-form?workerId=${encodeURIComponent(workerId)}&keys=${encodeURIComponent(keys.join(","))}&mode=${mode}`;
}

// 提出書類一覧表の参考様式の行（「有」のとき）に出す欄: 作成（PDF）・ひな形と記入位置
export function RefFormRowBar({
  formKey,
  workerId,
  nationality,
  templates,
  canEdit,
  onManage,
}: {
  formKey: string;
  workerId: string;
  nationality: string;
  templates: RefFormTemplate[];
  canEdit: boolean;
  onManage: () => void;
}) {
  const list = templates.filter((t) => t.form_key === formKey);
  const picked = pickRefFormTemplate(templates, formKey, nationality);
  const lang = languageForNationality(nationality);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-brand/30 bg-brand/5 px-2 py-1.5 text-[11px]">
      <FileText size={13} className="text-brand" />
      <span className="font-bold">{refFormName(formKey)}</span>
      {picked ? (
        <>
          <span className="text-muted">
            {picked.language}の版で作ります
            {lang && picked.language !== lang ? `（${lang}の版は未登録）` : ""}
            {picked.sign_pages.length > 0 ? `・署名 ${picked.sign_pages.map((p) => p + 1).join("・")}ページ目` : ""}
          </span>
          <a
            href={refFormHref(workerId, [formKey], "one")}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-[28px] items-center gap-1 rounded-md bg-brand px-2 font-bold text-brand-foreground"
          >
            <Download size={12} />
            作成（この様式だけ）
          </a>
        </>
      ) : (
        <span className="font-bold text-seal">ひな形が未登録です</span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onManage}
          className={`${picked ? "" : "ml-auto"} inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border bg-surface px-2 font-bold text-brand`}
        >
          <PenLine size={12} />
          ひな形・記入位置（{list.length}）
        </button>
      )}
    </div>
  );
}

// 様式1つのひな形（言語ごと）を登録・差し替え・記入位置を置く・削除する
export function RefFormTemplatesDialog({
  formKey,
  formLabel,
  templates,
  defaultLanguage,
  onClose,
  onChanged,
}: {
  formKey: string;
  formLabel: string;
  templates: RefFormTemplate[];
  defaultLanguage: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const list = templates.filter((t) => t.form_key === formKey);
  const [language, setLanguage] = useState(defaultLanguage || "日本語");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RefFormTemplate | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.type !== "application/pdf") throw new Error("PDFを選んでください");
      const ticket = await createRefFormTicket(formKey, language, file.type);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const res = await registerRefFormPdf(formKey, language, ticket.path, file.name);
      if (!res.ok) throw new Error(res.message);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: RefFormTemplate) => {
    if (!window.confirm(`${refFormName(formKey)}（${t.language}）のひな形と記入位置を削除します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    const res = await deleteRefFormTemplate(t.id);
    if (!res.ok) setError(res.message);
    await onChanged();
    setBusy(false);
  };

  if (editing) {
    return (
      <RefFormLayoutEditor
        templateId={editing.id}
        formKey={formKey}
        language={editing.language}
        initialLayout={editing.layout}
        initialSignPages={editing.sign_pages}
        onClose={() => setEditing(null)}
        onSaved={() => void onChanged()}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface p-4 text-xs shadow-xl">
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black">{refFormName(formKey)} のひな形・記入位置</p>
            <p className="text-[11px] text-muted">{formLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="p-1">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          入管のホームページの参考様式のPDF（空のもの、またはある程度記入したもの）を言語ごとに登録し、「記入位置」でどこに何を書くかと、本人の署名が要るページを置きます。
          全員共通で使います。作成するときは、本人の国籍に合う言語の版を使い、無ければ日本語の版を使います。
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">言語</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="min-h-[34px] rounded-lg border border-border bg-surface px-2"
            >
              {REF_FORM_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                  {list.some((t) => t.language === l) ? "（登録済み・差し替え）" : ""}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-brand px-3 font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            この言語のPDFを登録
          </button>
        </div>
        {error && <p className="mb-2 rounded bg-seal/10 p-2 text-seal">{error}</p>}

        {list.length === 0 ? (
          <p className="rounded-lg bg-background p-3 text-center text-muted">まだ登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {list.map((t) => {
              const count = Array.isArray(t.layout) ? t.layout.length : 0;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2">
                  <span className="font-bold">{t.language}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {t.pdf_name || "PDF"}・置いた項目 {count}件・署名ページ{" "}
                    {t.sign_pages.length > 0 ? t.sign_pages.map((p) => p + 1).join("・") : "なし"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-md bg-brand px-2 font-bold text-brand-foreground"
                  >
                    <PenLine size={12} />
                    記入位置
                  </button>
                  <a
                    href={`/api/ref-form?templateId=${encodeURIComponent(t.id)}&sample=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[30px] items-center rounded-md border border-border px-2 font-bold text-brand"
                  >
                    見本
                  </a>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(t)}
                    className="inline-flex min-h-[30px] items-center rounded-md px-1.5 text-muted hover:text-seal"
                    aria-label="削除"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
