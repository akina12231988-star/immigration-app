"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, PenLine, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  BUNDLED_REF_FORMS,
  REF_FORM_LANGUAGES,
  REF_FORM_MIGRATION,
  languageForNationality,
  normalizeRefFormLayout,
  normalizeSignPages,
  pickRefFormTemplate,
  refFormCircles,
  refFormName,
  type RefFormMode,
  type RefFormTemplate,
} from "@/lib/ref-form";
import { createRefFormTicket, deleteRefFormTemplate, registerBundledRefForms, registerRefFormPdf } from "@/app/(app)/ref-forms/actions";
import { RefFormLayoutEditor } from "./RefFormLayoutEditor";
import { useLockPageScroll } from "@/hooks/useLockPageScroll";
import { unlockPdfForFilling } from "@/lib/pdf-unlock";

// 参考様式のひな形（ref_form_templates。0227）を読む
export function useRefFormTemplates() {
  const [templates, setTemplates] = useState<RefFormTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const cols = "id, form_key, language, pdf_path, pdf_name, layout, sign_pages, updated_at";
    // 所属機関別の版（0228）が未適用でも、全員共通の版は読めるようにする
    const first = await createClient().from("ref_form_templates").select(`${cols}, organization_id`).order("language");
    const { data, error: err } = first.error
      ? await createClient().from("ref_form_templates").select(cols).order("language")
      : first;
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
// off は作るときに外す○（「ひな形ID:項目ID」）
// todoNo は申請準備のTODO番号（書類作成日を読むのに使う）
export function refFormHref(
  workerId: string,
  keys: string[],
  mode: RefFormMode,
  off: string[] = [],
  todoNo = "",
  language = "", // 空なら国籍の言語。選んだときはその言語の版（無ければ日本語の版）で作る
  fee = "", // 紹介手数料（1-16号に書く金額）
): string {
  let href = `/api/ref-form?workerId=${encodeURIComponent(workerId)}&keys=${encodeURIComponent(keys.join(","))}&mode=${mode}`;
  if (language) href += `&lang=${encodeURIComponent(language)}`;
  if (fee) href += `&fee=${encodeURIComponent(fee)}`;
  if (off.length > 0) href += `&off=${encodeURIComponent(off.join(","))}`;
  if (todoNo) href += `&todoNo=${encodeURIComponent(todoNo)}`;
  return href;
}

// 提出書類一覧表の参考様式の行（「有」のとき）に出す欄: 作成（PDF）・ひな形と記入位置
export function RefFormRowBar({
  formKey,
  workerId,
  nationality,
  orgId,
  orgName,
  templates,
  canEdit,
  onManage,
  off,
  onOffChange,
  todoNo,
  fee = "",
  onFeeChange,
  feePresets = [],
  rowKey,
}: {
  rowKey?: string; // 提出書類一覧表の行のキー（作成画面からその行へ添付するのに使う）
  formKey: string;
  workerId: string;
  nationality: string;
  orgId: string | null; // 申請準備中の所属機関（その所属機関の版があれば使う）
  orgName: string;
  templates: RefFormTemplate[];
  canEdit: boolean;
  onManage: () => void;
  // 作るときに外す○（「ひな形ID:項目ID」）。一覧の側で持ち、まとめてダウンロードにも使う
  off: string[];
  onOffChange: (next: string[]) => void;
  todoNo: string;
  // 紹介手数料（1-16号 雇用の経緯に係る説明書に書く金額）。onFeeChange を渡した行だけ入力欄を出す
  fee?: string;
  onFeeChange?: (v: string) => void;
  feePresets?: number[]; // 所属機関に登録した「よく使う紹介手数料」
}) {
  const list = templates.filter((t) => t.form_key === formKey && (!t.organization_id || t.organization_id === orgId));
  const picked = pickRefFormTemplate(templates, formKey, nationality, orgId);
  const lang = languageForNationality(nationality);
  // 登録してある言語の版（全員共通・この所属機関の版ごと）。ひと目で分かるように並べる
  const commonLangs = [...new Set(list.filter((t) => !t.organization_id).map((t) => t.language))];
  const orgLangs = [...new Set(list.filter((t) => t.organization_id).map((t) => t.language))];
  // 本人の国籍の言語の版が無い（日本語の版で代わりに作っているときも含む）
  const langMissing = !!lang && lang !== "日本語" && !list.some((t) => t.language === lang);
  // 記入位置に置いた○。チェックを外したものは、この様式を作るときに書かない
  const circles = picked ? refFormCircles(normalizeRefFormLayout(picked.layout)) : [];
  const offKey = (id: string) => `${picked?.id}:${id}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-brand/30 bg-brand/5 px-2 py-1.5 text-[11px]">
      <FileText size={13} className="text-brand" />
      <span className="font-bold">{refFormName(formKey)}</span>
      {picked ? (
        <>
          <span className="text-muted">
            {picked.organization_id ? (
              <span className="mr-0.5 rounded bg-brand px-1 font-bold text-brand-foreground">{orgName || "この所属機関"}の版</span>
            ) : (
              "全員共通の"
            )}
            {picked.language}の版で作ります
            {lang && picked.language !== lang ? `（${lang}の版は未登録）` : ""}
            {picked.sign_pages.length > 0 ? `・署名 ${picked.sign_pages.map((p) => p + 1).join("・")}ページ目` : ""}
            {formKey === "t1-18" ? "・最後のページに名簿（支援業務を行う体制についての説明）が付きます" : ""}
          </span>
          <a
            href={`/workers/${workerId}/application-prep/unified/ref-form/${encodeURIComponent(formKey)}?${new URLSearchParams({
              ...(todoNo ? { todo: todoNo } : {}),
              ...(fee ? { fee } : {}),
              ...(rowKey ? { row: rowKey } : {}),
            }).toString()}`}
            className="ml-auto inline-flex min-h-[28px] items-center gap-1 rounded-md border border-brand bg-surface px-2 font-bold text-brand"
          >
            <PenLine size={12} />
            内容を確認して作る・添付
          </a>
        </>
      ) : (
        <>
          <span className="font-bold text-seal">
            ひな形が未登録です{lang ? `（${lang}・日本語の版がありません）` : "（日本語の版がありません）"}
          </span>
          {/* 押せないが、ボタンの場所はほかの行と同じにして、ひな形を登録すれば押せると分かるようにする */}
          <span
            aria-disabled
            title="ひな形（本人の言語か日本語の版）を登録すると押せます"
            className="ml-auto inline-flex min-h-[28px] cursor-not-allowed items-center gap-1 rounded-md border border-border bg-background px-2 font-bold text-muted"
          >
            <PenLine size={12} />
            内容を確認して作る・添付（ひな形を登録すると押せます）
          </span>
        </>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border bg-surface px-2 font-bold text-brand"
        >
          <PenLine size={12} />
          ひな形・記入位置（{list.length}）
        </button>
      )}
      {/* 登録してある言語の版。本人の国籍の言語が無ければ登録を促す */}
      <div className="flex w-full flex-wrap items-center gap-1 border-t border-brand/20 pt-1">
        <span className="text-muted">登録してある言語：</span>
        {list.length === 0 && <span className="text-muted">なし</span>}
        {[
          ...commonLangs.map((l) => ({ l, org: false })),
          ...orgLangs.map((l) => ({ l, org: true })),
        ].map(({ l, org }) => (
          <span
            key={`${org ? "o" : "c"}:${l}`}
            className={`rounded px-1.5 py-0.5 font-bold ${
              l === lang
                ? "bg-status-approved-bg text-status-approved-fg"
                : org
                  ? "bg-brand/15 text-brand"
                  : "bg-background text-foreground"
            }`}
            title={org ? `${orgName || "この所属機関"}の版` : "全員共通の版"}
          >
            {l}
            {org ? `（${orgName || "所属機関"}）` : ""}
            {l === lang ? " ✓本人の言語" : ""}
          </span>
        ))}
        {langMissing && (
          <span className="flex flex-wrap items-center gap-1 font-bold text-seal">
            本人の言語（{lang}）の版がありません
            {canEdit && (
              <button
                type="button"
                onClick={onManage}
                className="inline-flex min-h-[26px] items-center gap-1 rounded-md bg-seal px-2 text-white"
              >
                <Upload size={11} />
                {lang}の版を登録する
              </button>
            )}
          </span>
        )}
      </div>
      {onFeeChange && (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-brand/20 pt-1">
          <span className="font-bold">紹介手数料</span>
          <input
            value={fee ? Number(fee).toLocaleString("ja-JP") : ""}
            onChange={(e) => onFeeChange(e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="例: 300,000"
            className="min-h-[28px] w-28 rounded border border-border bg-surface px-1.5 text-right"
          />
          <span>円</span>
          {feePresets.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onFeeChange(String(n))}
              className={`inline-flex min-h-[28px] items-center rounded-md border px-2 font-bold ${
                fee === String(n) ? "border-brand bg-brand text-brand-foreground" : "border-brand/40 bg-surface text-brand"
              }`}
            >
              {n.toLocaleString("ja-JP")}円
            </button>
          ))}
          <span className="text-muted">
            {feePresets.length > 0
              ? "今回の手数料を押すか入れてから作ってください（所属機関の「よく使う紹介手数料」）"
              : "金額を入れてから作ってください（所属機関の画面で「よく使う紹介手数料」を登録するとボタンで選べます）"}
            。記入位置に「紹介手数料」を置いた所に書きます。
          </span>
          {!fee && <span className="font-bold text-seal">未入力（空欄のまま作ります）</span>}
        </div>
      )}
      {circles.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand/20 pt-1">
          <span className="text-muted">付ける○（要らないものはチェックを外すと、作るときに書きません）:</span>
          {circles.map((c) => (
            <label key={c.id} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={!off.includes(offKey(c.id))}
                onChange={(e) =>
                  onOffChange(e.target.checked ? off.filter((x) => x !== offKey(c.id)) : [...off, offKey(c.id)])
                }
              />
              {c.label}
            </label>
          ))}
        </div>
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
  orgId,
  orgName,
  onClose,
  onChanged,
  defaultScope = "common",
  formName,
}: {
  formKey: string;
  formLabel: string;
  templates: RefFormTemplate[];
  defaultLanguage: string;
  formName?: string; // 様式の名前（追加した様式など、refFormName で引けないとき）
  defaultScope?: "common" | "org"; // 登録先の最初の選択（所属機関の参考様式の準備から開いたときは所属機関別の様式を「この所属機関だけ」に）
  orgId: string | null; // 申請準備中の所属機関（この所属機関だけの版を登録できる）
  orgName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  // 出すのは全員共通の版と、この所属機関の版（ほかの所属機関の版は出さない）
  const list = templates.filter((t) => t.form_key === formKey && (!t.organization_id || t.organization_id === orgId));
  const [language, setLanguage] = useState(defaultLanguage || "日本語");
  // 登録先: 全員共通か、この所属機関だけか
  const [scope, setScope] = useState<"common" | "org">(defaultScope === "org" && orgId ? "org" : "common");
  const name = formName || refFormName(formKey);
  const scopeOrg = scope === "org" && orgId ? orgId : null;
  const sameScope = (t: RefFormTemplate) => (t.organization_id ?? null) === scopeOrg;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<RefFormTemplate | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // ひな形の画面・記入位置の画面を開いている間は下の申請準備の画面を止め、閉じたら元の位置に戻す
  useLockPageScroll();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.type !== "application/pdf") throw new Error("PDFを選んでください");
      // 保護（変更不可）が付いた PDF は、書き込めるように画像の PDF に作り直してから登録する
      const unlocked = await unlockPdfForFilling(file);
      file = unlocked.file;
      setNotice(
        unlocked.converted
          ? "このPDFには保護（変更不可）が付いていたので、書き込めるように作り直して登録しました（見た目は同じです）。"
          : null,
      );
      const ticket = await createRefFormTicket(formKey, language, file.type);
      if (!ticket.ok) throw new Error(ticket.message);
      const { error: upErr } = await createClient()
        .storage.from("app-files")
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: "application/pdf" });
      if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);
      const res = await registerRefFormPdf(formKey, language, ticket.path, file.name, scopeOrg);
      if (!res.ok) throw new Error(res.message);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: RefFormTemplate) => {
    if (!window.confirm(`${name}（${t.language}）のひな形と記入位置を削除します。よろしいですか？`)) return;
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
        formName={name}
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
            <p className="text-sm font-black">{name} のひな形・記入位置</p>
            <p className="text-[11px] text-muted">{formLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="p-1">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          入管のホームページの参考様式のPDF（空のもの、またはある程度記入したもの）を言語ごとに登録し、「記入位置」でどこに何を書くかと、本人の署名が要るページを置きます。
          登録先は「全員共通」か「この所属機関だけ」を選べます（雇用条件書など、所属機関ごとに書式が違う様式は所属機関別に）。
          作成するときは、その所属機関の版があればそれを、無ければ全員共通の版を使います。どちらも本人の国籍に合う言語の版 → 日本語の版の順に選びます。
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted">登録先</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "common" | "org")}
              className="min-h-[34px] rounded-lg border border-border bg-surface px-2"
            >
              <option value="common">全員共通</option>
              {orgId && <option value="org">{orgName || "この所属機関"}だけ</option>}
            </select>
          </label>
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
                  {list.some((t) => t.language === l && sameScope(t)) ? "（登録済み・差し替え）" : ""}
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
        {/* アプリに入れてある入管の様式（未記入・日本語）を、全員共通のひな形にする */}
        {BUNDLED_REF_FORMS[formKey] && !templates.some((t) => t.form_key === formKey && t.language === "日本語" && !t.organization_id) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-brand/40 p-2">
            <span className="min-w-0 flex-1 text-[11px]">アプリに入管の未記入の様式（日本語）が入っています。</span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await registerBundledRefForms([formKey]);
                if (!res.ok) setError(res.message);
                await onChanged();
                setBusy(false);
              }}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-3 font-bold text-brand-foreground disabled:opacity-50"
            >
              それを全員共通（日本語）のひな形にする
            </button>
          </div>
        )}
        {error && <p className="mb-2 rounded bg-seal/10 p-2 text-seal">{error}</p>}
        {notice && <p className="mb-2 rounded bg-status-approved-bg p-2 text-status-approved-fg">{notice}</p>}

        {list.length === 0 ? (
          <p className="rounded-lg bg-background p-3 text-center text-muted">まだ登録されていません。</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {list.map((t) => {
              const count = Array.isArray(t.layout) ? t.layout.length : 0;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      t.organization_id ? "bg-brand text-brand-foreground" : "bg-background text-muted"
                    }`}
                  >
                    {t.organization_id ? `${orgName || "この所属機関"}だけ` : "全員共通"}
                  </span>
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
