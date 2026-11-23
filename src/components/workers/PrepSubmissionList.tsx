"use client";

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Eye, Loader2, Paperclip, Printer, Trash2 } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { isJapaneseOnlyRefForm, REF_FORM_LANGUAGES, SIGN_ONLY_REF_FORM_KEYS, isRefFormItem, languageForNationality, missingBundledRefForms, parseReferralFeePresets, pickRefFormTemplate, refFormName } from "@/lib/ref-form";
import { createClient } from "@/lib/supabase/client";
import { registerBundledRefForms } from "@/app/(app)/ref-forms/actions";
import { SUBMISSION_PDF_TEMPLATES, canFillSubmissionPdf, fillSubmissionPdf, submissionPdfTables } from "@/lib/submission-pdf";
import { RefFormRowBar, RefFormTemplatesDialog, refFormHref, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";
import type { OnboardingDocumentRow } from "@/types/db";
import { SupportOrgFileAttachments } from "@/app/(app)/support-org/SupportOrgFileAttachments";
import { PrepAgriNoticeSection, PrepOrgFileSection } from "@/components/workers/PrepSupportOrgSection";
import { ORG_FILE_KIND_CHANGE_APP_ANNEX } from "@/lib/org-attachments";
import { SUPPORT_ORG_LISTING_FILE_KIND } from "@/lib/support-org-info";
import {
  SUBMISSION_TABLE_ORDER,
  canonicalSubmissionKey,
  submissionLink,
  submissionListTitle,
  SUBMISSION_TABLE_TITLES,
  submissionListPrintHtml,
  type SubmissionPast,
  type SubmissionRow,
  type SubmitMark,
} from "@/lib/submission-list";

// 紹介手数料を書き換えたときに出すイベント（localStorage の値を読み直す）
const FEE_EVENT = "ref-form-fee-change";

// 申請準備の詳細の「提出書類一覧表」。入管の一覧表と同じ番号・順番で書類を並べ、
// 提出確認欄の「有」「無」を押して選ぶ（押していない行は、申請準備の情報から見当を付けて出す）。
// ○を付けた一覧表を A4 で印刷できる。
export function PrepSubmissionList({
  rows,
  canEdit,
  workerName,
  orgName,
  todoNo = "",
  onMark,
  onError,
  renderAction,
  renderReason,
  past = {},
  onPast,
  pastCandidates = [],
  missingAttachKeys = [],
  workerId,
  nationality = "",
  orgId = null,
}: {
  rows: SubmissionRow[];
  canEdit: boolean;
  workerName: string;
  orgName: string;
  todoNo?: string; // 申請準備のTODO番号（参考様式の書類作成日に使う）
  // 有／無を選ぶ（null は選択を外して見当に戻す）
  onMark: (key: string, mark: SubmitMark | null) => void;
  onError: (message: string) => void;
  // 「有」の行の下に出す、書類を揃えるための欄（添付・作る場所へのリンク）
  renderAction?: (row: SubmissionRow) => ReactNode;
  // どの行にも出す「理由書を添付する」（「無」の行でも、出せない理由を書いて添える）
  renderReason?: (row: SubmissionRow) => ReactNode;
  // 過去に提出した申請情報（過去1年以内の申請で出した書類の行。入管の様式のその欄に書く）
  past?: Record<string, SubmissionPast>;
  onPast?: (key: string, value: SubmissionPast | null) => void;
  // 転用できる申請の候補（1年以内の申請を新しい順＋手入力の前回の申請）
  pastCandidates?: (SubmissionPast & { label: string })[];
  missingAttachKeys?: string[]; // 「有」なのに何も添付していない行（行のキー）
  // 参考様式の作成（ひな形に書き込んだPDF）に使う。渡したときだけ参考様式の欄を出す
  workerId?: string;
  nationality?: string;
  orgId?: string | null; // 申請準備中の所属機関（所属機関別のひな形を使う・登録する）
}) {
  const [openNotes, setOpenNotes] = useState(false);
  const refForms = useRefFormTemplates();
  const [managing, setManaging] = useState<SubmissionRow | null>(null);
  // 本人に署名してもらうだけの書類のひな形を管理しているとき（キー）
  const [managingKey, setManagingKey] = useState<string | null>(null);
  // 参考様式を作るときに外す○（「ひな形ID:項目ID」）。様式ごとの作成・まとめてダウンロードの両方に使う
  const [refOff, setRefOff] = useState<string[]>([]);
  // アプリに入れてある入管の参考様式（未記入）のうち、まだ全員共通のひな形にしていないもの
  const bundledMissing = workerId ? missingBundledRefForms(refForms.templates) : [];
  const [bundling, setBundling] = useState(false);
  const [bundleNote, setBundleNote] = useState<string | null>(null);
  const registerBundled = async () => {
    setBundling(true);
    setBundleNote(null);
    try {
      const res = await registerBundledRefForms(bundledMissing);
      if (!res.ok) throw new Error(res.message);
      await refForms.reload();
      setBundleNote(
        res.added.length > 0
          ? `${res.added.map(refFormName).join("・")} を全員共通（日本語）のひな形として登録しました。行の「ひな形・記入位置」から記入位置を置いてください。`
          : "登録するものはありませんでした（もう登録されています）。",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "参考様式の登録に失敗しました");
    } finally {
      setBundling(false);
    }
  };
  // 「有」の参考様式（一覧表の順）。ひな形が登録されているものだけを作れる
  const refRows = workerId ? rows.filter((r) => r.mark === "有" && isRefFormItem(r)) : [];
  // 参考様式のひな形は、1号と同じ書類なら1号のキーで引く（2号でも 1-5号・1-6号 などは同じひな形）
  const refKey = (r: SubmissionRow) => canonicalSubmissionKey(r.key);
  // まとめてダウンロードの言語。空なら国籍の言語（その言語の版が無い様式は日本語の版）
  const [bulkLang, setBulkLang] = useState("");
  // 紹介手数料（1-16号に書く金額・数字だけ）。この人・この申請の分をブラウザに覚えておく
  const feeStoreKey = `refFormFee:${workerId ?? ""}:${todoNo}`;
  // localStorage を外のストアとして読む（書き換えたら同じページの購読者に知らせる）
  const fee = useSyncExternalStore(
    (cb) => {
      window.addEventListener(FEE_EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(FEE_EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(feeStoreKey) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const setFee = (v: string) => {
    try {
      if (v) window.localStorage.setItem(feeStoreKey, v);
      else window.localStorage.removeItem(feeStoreKey);
    } catch {
      // 覚えておけなくても作るのには困らない（このときは入力が残らない）
    }
    window.dispatchEvent(new Event(FEE_EVENT));
  };
  // 所属機関の「よく使う紹介手数料」
  const [feePresets, setFeePresets] = useState<number[]>([]);
  useEffect(() => {
    if (!orgId || !workerId) return;
    let cancelled = false;
    void createClient()
      .from("organizations")
      .select("intake")
      .eq("id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        const intake = (data as { intake: { referral_fees?: unknown } | null } | null)?.intake;
        if (!cancelled) setFeePresets(parseReferralFeePresets(typeof intake?.referral_fees === "string" ? intake.referral_fees : ""));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, workerId]);
  const natLang = languageForNationality(nationality);
  const bulkPick = (key: string) => pickRefFormTemplate(refForms.templates, key, nationality, orgId, bulkLang || null);
  const refReady = refRows.filter((r) => bulkPick(refKey(r)));
  const refSignReady = refReady.filter((r) => (bulkPick(refKey(r))?.sign_pages.length ?? 0) > 0);
  // 入管には出さず、本人に署名してもらうだけの書類（事前ガイダンス・生活オリエンテーションの確認書）。特定技能1号だけ
  const signOnlyKeys: string[] = workerId && rows.some((r) => r.key.startsWith("t1-")) ? [...SIGN_ONLY_REF_FORM_KEYS] : [];
  const signOnlyReady = signOnlyKeys.filter((k) => bulkPick(k));
  const signKeys = [...refSignReady.map(refKey), ...signOnlyReady];
  // まとめてダウンロードに入る様式ごとの言語の版（選んだ言語の版が無く日本語の版を使うものは知らせる）
  const wantLang = bulkLang || natLang;
  const bulkVersions = [...refRows.map(refKey), ...signOnlyKeys].map((k) => {
    const t = bulkPick(k);
    return {
      key: k,
      language: t?.language ?? null,
      // 日本語の版だけの様式は日本語で作るのが正しいので、代わりに使っている扱いにしない
      fallback: !!t && !!wantLang && t.language !== wantLang && !isJapaneseOnlyRefForm(refForms.templates, k, orgId),
    };
  });
  const undecided = rows.filter((r) => r.mark == null);
  const autoCount = rows.filter((r) => r.auto && r.mark != null).length;
  const yesCount = rows.filter((r) => r.mark === "有").length;

  // 入管の様式の PDF が全部そろっている一覧表は、その PDF に○と氏名・所属機関名を書き込んで開く。
  // そろっていない一覧表（特定技能2号の表紙・第1表など）は、アプリで作った簡易版を印刷する
  const officialPdf = canFillSubmissionPdf(rows);
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    if (
      undecided.length > 0 &&
      !window.confirm(
        `有・無を選んでいない書類があります（${undecided.map((r) => `${r.no}${r.sub ?? ""}`).join("・")}）。○を付けずに作りますか？`,
      )
    ) {
      return;
    }
    // ポップアップを止められないよう、押したときにすぐ新しいタブを開いておく
    const w = window.open("", "_blank");
    if (!w) {
      onError("新しいタブを開けませんでした。ブラウザのポップアップの許可をご確認ください。");
      return;
    }
    if (!officialPdf) {
      w.document.write(submissionListPrintHtml({ workerName, orgName, rows }));
      w.document.close();
      w.focus();
      w.print();
      return;
    }
    setPrinting(true);
    w.document.write("<p style='font-family:sans-serif;padding:24px'>提出書類一覧表（入管の様式）を作っています…</p>");
    try {
      const get = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`様式を読み込めませんでした（${url}）`);
        return new Uint8Array(await res.arrayBuffer());
      };
      const tables = submissionPdfTables(rows);
      const templates = Object.fromEntries(
        await Promise.all(tables.map(async (t) => [t, await get(SUBMISSION_PDF_TEMPLATES[t]!.file)] as const)),
      );
      const bytes = await fillSubmissionPdf({
        templates,
        fontBytes: await get("/fonts/NotoSansJP-Regular.ttf"),
        rows,
        workerName,
        orgName,
        past,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      w.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      w.close();
      onError(err instanceof Error ? err.message : "提出書類一覧表の PDF を作れませんでした");
    } finally {
      setPrinting(false);
    }
  };

  const tables = SUBMISSION_TABLE_ORDER.filter((t) => rows.some((r) => r.table === t));
  const listTitle = submissionListTitle(rows);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          入管の{listTitle.title}（在留資格変更許可申請用）と同じ番号・順番です。書類ごとに提出確認欄の「有」「無」を押してください。
          国保・年金・国籍・あっせん・合格証などから見当が付くものは、最初から選んであります（
          <span className="rounded bg-background px-1 font-bold">見当</span>
          の印）。押すと確定します。同一年度内に受け入れているかで変わる 4・7(1) などは選んでください。
        </p>
        <button
          type="button"
          onClick={() => void print()}
          disabled={printing}
          className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground disabled:opacity-60"
        >
          {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
          {officialPdf ? "○を付けた一覧表をPDFで作る（入管の様式）" : "○を付けた一覧表を印刷（簡易版）"}
        </button>
      </div>

      {workerId && refRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 p-2 text-[11px]">
          <span className="font-bold">
            参考様式（「有」{refRows.length}件・ひな形あり {refReady.length}件）
          </span>
          {/* 全部の様式のひな形がそろったら、1つの画面で在留カードを見ながら順に確かめて作り、行ごとに添付する */}
          {(() => {
            const natPick = (k: string) => pickRefFormTemplate(refForms.templates, k, nationality, orgId);
            const missing = refRows.filter((r) => !natPick(refKey(r)));
            const japaneseOnly = natLang
              ? refRows.filter((r) => {
                  const t = natPick(refKey(r));
                  // 日本語の版だけの様式（日本語で出す様式）は知らせない
                  return !!t && t.language !== natLang && !isJapaneseOnlyRefForm(refForms.templates, refKey(r), orgId);
                })
              : [];
            const rowsParam = [...refRows.map((r) => r.key), ...signOnlyKeys.filter((k) => natPick(k))].join(",");
            const ready = refRows.length > 0 && missing.length === 0;
            const href = `/workers/${workerId}/application-prep/unified/ref-forms?${new URLSearchParams({
              rows: rowsParam,
              ...(todoNo ? { todo: todoNo } : {}),
              ...(fee ? { fee } : {}),
            }).toString()}`;
            return (
              <span className="flex flex-wrap items-center gap-1">
                <a
                  href={ready ? href : undefined}
                  aria-disabled={!ready}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 font-black ${
                    ready ? "bg-status-approved-fg text-white" : "pointer-events-none bg-border text-muted"
                  }`}
                >
                  ✔ 参考様式をまとめて確認・作成（{refRows.length}件）
                </a>
                {!ready && missing.length > 0 && (
                  <span className="text-seal">ひな形が無い様式があります（{missing.map((r) => refFormName(refKey(r))).join("・")}）</span>
                )}
                {ready && japaneseOnly.length > 0 && (
                  <span className="text-status-notice-fg">
                    {natLang}の版が無く日本語の版で作る様式: {japaneseOnly.map((r) => refFormName(refKey(r))).join("・")}
                  </span>
                )}
              </span>
            );
          })()}
          <a
            href={refReady.length > 0 ? refFormHref(workerId, refReady.map(refKey), "all", refOff, todoNo, bulkLang, fee) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={refReady.length === 0}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 font-bold ${
              refReady.length > 0 ? "bg-brand text-brand-foreground" : "pointer-events-none bg-border text-muted"
            }`}
          >
            参考様式を一気にダウンロード（{refReady.length}件）
          </a>
          <a
            href={signKeys.length > 0 ? refFormHref(workerId, signKeys, "sign", refOff, todoNo, bulkLang, fee) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={signKeys.length === 0}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 font-bold ${
              signKeys.length > 0 ? "border border-seal bg-surface text-seal" : "pointer-events-none bg-border text-muted"
            }`}
            title="事前ガイダンス・生活オリエンテーションの確認書（ひな形を登録したもの）も入ります"
          >
            ✍ 本人に署名してもらうページだけ（{signKeys.length}件）
          </a>
          {/* 言語の版。最初は本人の国籍の言語。選び直すと、上の2つのダウンロードがその言語の版になる */}
          <label className="flex items-center gap-1">
            <span className="font-bold">言語</span>
            <select
              value={bulkLang}
              onChange={(e) => setBulkLang(e.target.value)}
              className="min-h-[34px] rounded-lg border border-border bg-surface px-2"
            >
              <option value="">国籍に合わせる（{natLang || `${nationality || "国籍未登録"}→日本語`}）</option>
              {REF_FORM_LANGUAGES.filter((l) => l !== natLang).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {refForms.error && <span className="text-seal">{refForms.error}</span>}
          {/* 様式ごとに、どの言語の版が入るか */}
          <p className="w-full leading-relaxed text-muted">
            入る版：
            {bulkVersions.map((v, i) => (
              <span key={v.key} className={v.language == null ? "text-seal" : v.fallback ? "text-status-notice-fg" : ""}>
                {i > 0 && "・"}
                {refFormName(v.key)}（{v.language == null ? "ひな形なし・入りません" : v.fallback ? `${wantLang}の版が無いので${v.language}` : v.language}）
              </span>
            ))}
          </p>
          {refReady.length < refRows.length && (
            <span className="text-muted">ひな形が未登録の様式は入りません（行の「ひな形・記入位置」から登録）</span>
          )}
        </div>
      )}

      {/* 「有」に○を付けたのに何も添付していない書類（押すとその行へ） */}
      {missingAttachKeys.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-seal bg-seal/10 p-2.5 text-xs text-seal">
          <p className="font-black">⚠ 「有」に○を付けたのに、まだ何も添付していない書類があります（{missingAttachKeys.length}件）</p>
          <p className="mt-0.5 text-[11px]">添付するか、出さない書類なら「無」にしてください。</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missingAttachKeys.map((k) => {
              const r = rows.find((x) => x.key === k);
              if (!r) return null;
              return (
                <a
                  key={k}
                  href={`#prep-list-row-${k}`}
                  className="rounded border border-seal/40 bg-surface px-1.5 py-0.5 font-bold underline"
                >
                  {r.no}
                  {r.sub ?? ""} {r.label.length > 24 ? `${r.label.slice(0, 24)}…` : r.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* 入管には出さず、本人に署名してもらうだけの書類。言語ごとのひな形を登録し、記入位置を置いて作る */}
      {signOnlyKeys.length > 0 && workerId && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-seal/30 bg-seal/5 p-2 text-[11px]">
          <p className="font-bold text-seal">
            ✍ 本人に署名してもらう書類（入管には出さない）
            <span className="ml-1 font-normal text-muted">
              言語ごとにひな形を登録し、記入位置（事前ガイダンス・生活オリエンテーションの実施日など）を置きます。上の「本人に署名してもらうページだけ」にも入ります。
            </span>
          </p>
          {signOnlyKeys.map((k) => (
            <RefFormRowBar
              key={k}
              todoNo={todoNo}
              off={refOff}
              onOffChange={setRefOff}
              formKey={k}
              workerId={workerId}
              nationality={nationality}
              orgId={orgId}
              orgName={orgName}
              templates={refForms.templates}
              canEdit={canEdit}
              onManage={() => setManagingKey(k)}
            />
          ))}
        </div>
      )}

      {!officialPdf && (
        <p className="rounded-lg bg-status-notice-bg px-3 py-2 text-[11px] text-status-notice-fg">
          この一覧表は、入管の様式の PDF がまだアプリに入っていないため、印刷はアプリで作った簡易版になります（入管の様式の PDF を入れると、その様式に○を付けて作れます）。
        </p>
      )}
      {workerId && canEdit && bundledMissing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-brand/40 bg-background p-2 text-[11px]">
          <span className="min-w-0 flex-1">
            アプリに入っている入管の参考様式（未記入）がまだひな形になっていません：
            <b>{bundledMissing.map(refFormName).join("・")}</b>
          </span>
          <button
            type="button"
            disabled={bundling}
            onClick={() => void registerBundled()}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-brand px-3 font-bold text-brand-foreground disabled:opacity-60"
          >
            {bundling && <Loader2 size={13} className="animate-spin" />}
            全員共通のひな形として登録（{bundledMissing.length}件）
          </button>
        </div>
      )}
      {bundleNote && <p className="rounded-lg bg-status-approved-bg px-3 py-2 text-[11px] text-status-approved-fg">{bundleNote}</p>}

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-brand/10 px-2.5 py-1 font-bold text-brand">有 {yesCount}件</span>
        {autoCount > 0 && (
          <span className="rounded-full bg-background px-2.5 py-1 font-bold text-muted">見当のまま {autoCount}件</span>
        )}
        {undecided.length > 0 ? (
          <a href="#prep-list-undecided" className="rounded-full bg-seal px-2.5 py-1 font-bold text-seal-foreground">
            未選択 {undecided.length}件（{undecided.map((r) => `${r.no}${r.sub ?? ""}`).join("・")}）
          </a>
        ) : (
          <span className="rounded-full bg-background px-2.5 py-1 font-bold text-muted">全部選びました</span>
        )}
        {missingAttachKeys.length > 0 && (
          <span className="rounded-full bg-seal px-2.5 py-1 font-bold text-seal-foreground">⚠ 「有」なのに添付なし {missingAttachKeys.length}件</span>
        )}
        <button
          type="button"
          onClick={() => setOpenNotes((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 font-bold text-brand"
        >
          <ChevronDown size={12} className={openNotes ? "rotate-180" : ""} />
          留意事項を{openNotes ? "隠す" : "出す"}
        </button>
      </div>

      {tables.map((t) => {
        const list = rows.filter((r) => r.table === t);
        let lastGroup = "";
        return (
          <div key={t} className="overflow-x-auto rounded-xl border border-border">
            <p className="bg-background px-3 py-2 text-xs font-black">{SUBMISSION_TABLE_TITLES[t]}</p>
            <table className="w-full min-w-[36rem] border-collapse text-xs">
              <thead>
                <tr className="bg-background text-[11px] text-muted">
                  <th className="w-10 border-t border-border px-2 py-1.5">番号</th>
                  <th className="border-t border-border px-2 py-1.5 text-left">必要書類</th>
                  <th className="w-28 border-t border-border px-2 py-1.5">様式・発行機関</th>
                  <th className="w-10 border-t border-border px-2 py-1.5">要否</th>
                  <th className="w-36 border-t border-border px-2 py-1.5">提出確認欄</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const showGroup = r.group && r.group !== lastGroup;
                  lastGroup = r.group ?? "";
                  const firstUndecided = r.mark == null && undecided[0]?.key === r.key;
                  return (
                    <Fragment key={r.key}>
                      {showGroup && (
                        <tr>
                          <td className="border-t border-border bg-background px-2 py-1 text-[11px] font-bold text-seal" colSpan={5}>
                            {r.no}. {r.group}
                          </td>
                        </tr>
                      )}
                      <tr
                        id={firstUndecided ? "prep-list-undecided" : undefined}
                        className={r.mark == null ? "bg-seal/5" : r.mark === "無" ? "text-muted" : ""}
                      >
                        <td className="border-t border-border px-2 py-1.5 text-center font-bold tabular-nums">
                          {i > 0 && list[i - 1].no === r.no ? "" : r.no}
                        </td>
                        <td id={`prep-list-row-${r.key}`} className="scroll-mt-24 border-t border-border px-2 py-1.5">
                          {r.sub && <span className="mr-1 font-bold">{r.sub}</span>}
                          {r.label}
                          {missingAttachKeys.includes(r.key) && (
                            <span className="ml-1.5 inline-block rounded bg-seal px-1.5 py-0.5 text-[10px] font-bold text-seal-foreground">⚠ 有なのに添付なし</span>
                          )}
                          {openNotes && r.note && <p className="mt-0.5 text-[10px] leading-snug text-muted">※{r.note}</p>}
                          {/* 参考様式の欄（作成・ひな形と記入位置）。「有」と、まだ有／無を決めていない行に出す
                              （決める前でもひな形の登録・記入位置の準備ができるように）。「無」の行には出さない。
                              まとめてダウンロードに入るのは「有」の行だけ */}
                          {r.mark !== "無" && workerId && isRefFormItem(r) && (
                            <div className="mt-1.5">
                              <RefFormRowBar
                                todoNo={todoNo}
                                off={refOff}
                                onOffChange={setRefOff}
                                formKey={refKey(r)}
                                workerId={workerId}
                                nationality={nationality}
                                orgId={orgId}
                                orgName={orgName}
                                templates={refForms.templates}
                                canEdit={canEdit}
                                onManage={() => setManaging(r)}
                                rowKey={r.key}
                                // 1-16号（雇用の経緯に係る説明書）は紹介手数料を入れてから作る
                                {...(refKey(r) === "t1-7-1" ? { fee, onFeeChange: setFee, feePresets } : {})}
                              />
                            </div>
                          )}
                          {r.mark === "有" && renderAction && <div className="mt-1.5">{renderAction(r)}</div>}
                          {/* 過去1年以内の申請で出した書類は、その申請の申請年月日・受付番号を入れると一覧表の欄に書く（斜線の欄の行には出さない） */}
                          {/* 「転用」にした書類は、どの申請の申請日・受付番号を書くかを選ぶ（入管の様式の「過去に提出した申請情報」に書く） */}
                          {r.pastInfo && onPast && past[r.key] && (
                            <PastInfoPicker
                              key={`${r.key}-${past[r.key]?.on ?? ""}-${past[r.key]?.no ?? ""}`}
                              value={past[r.key]}
                              candidates={pastCandidates}
                              canEdit={canEdit}
                              onSave={(v) => onPast(r.key, v)}
                            />
                          )}
                          {renderReason?.(r)}
                        </td>
                        <td className="border-t border-border px-2 py-1.5 text-center text-[10px] text-muted">{r.formNo}</td>
                        <td className="border-t border-border px-2 py-1.5 text-center">{r.required}</td>
                        <td className="border-t border-border px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1">
                            {(["有", "無"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => onMark(r.key, r.mark === m && !r.auto ? null : m)}
                                title={r.mark === m && !r.auto ? "もう一度押すと選択を外します" : `「${m}」にする`}
                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black disabled:opacity-60 ${
                                  r.mark === m
                                    ? r.auto
                                      ? "border-dashed border-brand/60 text-brand"
                                      : m === "有"
                                        ? "border-brand bg-brand text-brand-foreground"
                                        : "border-muted bg-muted/20 text-foreground"
                                    : "border-border text-muted"
                                }`}
                              >
                                {m}
                              </button>
                            ))}
                            {r.auto && r.mark != null && (
                              <span className="rounded bg-background px-1 text-[10px] font-bold text-muted">見当</span>
                            )}
                            {r.mark == null && <span className="text-[10px] font-bold text-seal">未選択</span>}
                          </div>
                          {/* 過去1年以内の申請で出した書類は「転用」できる（提出せず、その申請の申請日・受付番号を書く） */}
                          {r.pastInfo && onPast && (
                            <label
                              className={`mt-1 flex items-center justify-center gap-1 text-[11px] ${past[r.key] ? "font-bold text-brand" : "text-muted"}`}
                              title="過去1年以内の申請で出した書類を転用します（提出せず、その申請の申請日・受付番号を一覧表に書きます）"
                            >
                              <input
                                type="checkbox"
                                checked={!!past[r.key]}
                                disabled={!canEdit}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const c = pastCandidates[0];
                                    onPast(r.key, { on: c?.on ?? "", no: c?.no ?? "" });
                                    // 転用する書類は今回は出さないので「無」にする
                                    if (r.mark !== "無" || r.auto) onMark(r.key, "無");
                                  } else onPast(r.key, null);
                                }}
                              />
                              転用
                            </label>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {managing && (
        <RefFormTemplatesDialog
          formKey={refKey(managing)}
          formLabel={managing.label}
          templates={refForms.templates}
          defaultLanguage={languageForNationality(nationality) || "日本語"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManaging(null)}
          onChanged={refForms.reload}
        />
      )}
      {managingKey && (
        <RefFormTemplatesDialog
          formKey={managingKey}
          formLabel={refFormName(managingKey)}
          templates={refForms.templates}
          defaultLanguage={languageForNationality(nationality) || "日本語"}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setManagingKey(null)}
          onChanged={refForms.reload}
        />
      )}
    </div>
  );
}

// 「有」の行で書類を揃える欄。
//  ・「必要な書類の準備」で揃える書類は、その状態と、その行へのリンク
//  ・アプリの中で作る書類は、その章へのリンク
//  ・アプリに無い書類は、この行に直接添付（ドラッグ＆ドロップも可）。添付したファイルはまとめた PDF に入る
export function SubmissionRowAction({
  row,
  canEdit,
  busy,
  docs,
  attachFiles,
  onAttach,
  onDrop,
  onPreview,
  onRemove,
  orgId = null,
  onOrgFilesChanged,
  onAttachDoc,
}: {
  orgId?: string | null; // 申請準備中の所属機関（協議会の構成員であることの証明書に、その所属機関の加入通知書を出す）
  onOrgFilesChanged?: () => void; // 所属機関の添付（申請書の別紙など）をこの場で添付したあと
  row: SubmissionRow;
  canEdit: boolean;
  busy: boolean;
  // 必要な書類で揃える書類。files はそこで添付したファイル（この行にも出して、押すと開ける）
  docs: { id: string; label: string; inList: boolean; satisfied: boolean; fileCount: number; files?: OnboardingDocumentRow[] }[];
  onAttachDoc?: (docId: string) => void; // 必要な書類のその書類に、この行から添付する
  attachFiles: OnboardingDocumentRow[] | null; // null はこの行に添付しない書類
  onAttach: () => void;
  onDrop: (files: FileList) => void;
  onPreview: (f: OnboardingDocumentRow) => void;
  onRemove: (f: OnboardingDocumentRow) => void;
}) {
  const section = submissionLink(row.key)?.section;
  // 「人材サービス総合サイト」の画面は、だれの申請でも同じ（当社の掲載画面）。全員共通で1つ登録して使う
  const sharedListing = canonicalSubmissionKey(row.key) === "t1-7-2";
  // 協議会の構成員であることの証明書は、所属機関に登録した農業特定技能協議会の加入通知書を使う（所属機関ごと）
  const councilNotice = (row.key === "t3a-3" || row.key === "s2a-3") && !!orgId;
  // 在留資格変更許可申請書の行には、所属機関に登録した「申請書の別紙」を出す（まとめた PDF で申請書のすぐ後に入る）
  const changeAppAnnex = canonicalSubmissionKey(row.key) === "t1-3" && !!orgId;
  const usesShared = sharedListing || councilNotice;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-2 text-[11px]">
      {councilNotice && orgId && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-2">
          <p className="mb-1 font-bold text-brand">
            所属機関の農業特定技能協議会の加入通知書（所属機関の画面と同じもの。ここで添付すると所属機関にも保存されます）
          </p>
          <PrepAgriNoticeSection orgId={orgId} canEdit={canEdit} />
        </div>
      )}
      {changeAppAnnex && orgId && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-2">
          <p className="mb-1 font-bold text-brand">
            所属機関の{ORG_FILE_KIND_CHANGE_APP_ANNEX}（所属機関ごと。ここで添付すると所属機関にも保存され、この所属機関のほかの人の申請にも出ます。まとめた PDF では申請書のすぐ後に入ります）
          </p>
          <PrepOrgFileSection
            orgId={orgId}
            canEdit={canEdit}
            onChanged={onOrgFilesChanged}
            kind={ORG_FILE_KIND_CHANGE_APP_ANNEX}
            linkLabel="所属機関の画面で別紙を見る・添付する →"
            newLabel="新しい別紙を添付"
          />
        </div>
      )}
      {sharedListing && (
        <div className="rounded-md border border-brand/30 bg-brand/5 p-2">
          <p className="mb-1 font-bold text-brand">
            全員共通の画面（登録支援機関の情報 ＞ 職業紹介事業者と同じもの。差し替えると全員に反映されます）
          </p>
          <SupportOrgFileAttachments
            kind={SUPPORT_ORG_LISTING_FILE_KIND}
            addLabel={`${SUPPORT_ORG_LISTING_FILE_KIND}の画面を追加（PDF・画像）`}
            canEdit={canEdit}
          />
        </div>
      )}
      {docs.map((d) => (
        <p key={d.id} className="flex flex-wrap items-center gap-1.5">
          {d.inList ? (
            d.satisfied ? (
              <CheckCircle2 size={13} className="text-status-approved-fg" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-seal" aria-hidden />
            )
          ) : (
            <span className="h-2 w-2 rounded-full bg-border" aria-hidden />
          )}
          <span className="font-bold">{d.label}</span>
          {d.inList ? (
            <>
              <span className={d.satisfied ? "text-muted" : "font-bold text-seal"}>
                {d.satisfied ? "揃っています" : "まだ"}
                {d.fileCount > 0 ? `（${d.fileCount}ファイル）` : ""}
              </span>
              <a href={`#prep-doc-${d.id}`} className="font-bold text-brand underline">
                必要な書類で見る →
              </a>
              {canEdit && onAttachDoc && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAttachDoc(d.id)}
                  className="inline-flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 font-bold text-brand disabled:opacity-50"
                  title="必要な書類のこの書類に添付します（ここから添付しても同じ所に入ります）"
                >
                  <Paperclip size={11} />
                  添付
                </button>
              )}
              {/* 必要な書類で添付したファイル。押すと開く（添付した書類をまとめた PDF にも入ります） */}
              {(d.files ?? []).length > 0 && (
                <span className="flex w-full flex-wrap gap-1 pl-5">
                  {(d.files ?? []).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onPreview(f)}
                      className="inline-flex items-center gap-1 rounded border border-brand/30 bg-surface px-1.5 py-0.5 text-brand"
                      title="開く"
                    >
                      <Eye size={11} />
                      {f.file_name || d.label}
                    </button>
                  ))}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted">（この申請の「必要な書類」には出ていません）</span>
          )}
        </p>
      ))}
      {section && (
        <a href={`#${section.anchor}`} className="font-bold text-brand underline">
          「{section.label}」で作る・確かめる →
        </a>
      )}
      {attachFiles && (
        <FileDropArea
          onFiles={onDrop}
          disabled={!canEdit || busy}
          className="rounded-md border border-dashed border-border bg-surface p-1.5"
          title="ここにファイルをドロップすると、この書類として添付されます"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {attachFiles.length === 0 ? (
              <span className={docs.length > 0 || usesShared ? "text-muted" : "font-bold text-seal"}>
                {councilNotice
                  ? "上の所属機関の加入通知書を使います（ほかの書類を使うときだけ添付）"
                  : sharedListing
                  ? "上の全員共通の画面を使います（この人だけ別の画面を使うときだけ添付）"
                  : docs.length > 0
                    ? "この行にも添付できます"
                    : "まだ添付していません"}
              </span>
            ) : (
              attachFiles.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5">
                  <Paperclip size={11} className="text-muted" />
                  <span className="max-w-[12rem] truncate">{f.file_name || "ファイル"}</span>
                  <button type="button" onClick={() => onPreview(f)} className="text-brand" aria-label="見る" title="見る">
                    <Eye size={12} />
                  </button>
                  {canEdit && (
                    <button type="button" onClick={() => onRemove(f)} className="text-muted hover:text-seal" aria-label="削除" title="削除">
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              ))
            )}
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={onAttach}
                className="ml-auto inline-flex min-h-[28px] items-center gap-1 rounded-md border border-border bg-surface px-2 font-bold text-brand disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                添付
              </button>
            )}
          </div>
        </FileDropArea>
      )}
    </div>
  );
}

// 「転用」にした書類で、どの申請の申請日・受付番号を書くかを選ぶ。候補に無ければ手で入れる
function PastInfoPicker({
  value,
  candidates,
  canEdit,
  onSave,
}: {
  value: SubmissionPast;
  candidates: (SubmissionPast & { label: string })[];
  canEdit: boolean;
  onSave: (v: SubmissionPast) => void;
}) {
  const hit = candidates.findIndex((c) => c.on === value.on && c.no === value.no);
  const [manual, setManual] = useState(hit < 0 && !!(value.on || value.no || candidates.length === 0));
  const [on, setOn] = useState(value.on);
  const [no, setNo] = useState(value.no);
  const saveManual = () => {
    if (on.trim() !== value.on || no.trim() !== value.no) onSave({ on: on.trim(), no: no.trim() });
  };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-brand/40 bg-brand/5 px-2 py-1 text-[11px]">
      <span className="font-bold text-brand">転用する申請</span>
      <select
        value={manual ? "manual" : hit >= 0 ? String(hit) : ""}
        disabled={!canEdit}
        onChange={(e) => {
          if (e.target.value === "manual") {
            setManual(true);
            return;
          }
          const c = candidates[Number(e.target.value)];
          if (!c) return;
          setManual(false);
          setOn(c.on);
          setNo(c.no);
          onSave({ on: c.on, no: c.no });
        }}
        className="min-h-[28px] max-w-full rounded border border-border bg-surface px-1"
      >
        {hit < 0 && !manual && <option value="">選んでください</option>}
        {candidates.map((c, i) => (
          <option key={`${c.on}-${c.no}`} value={i}>
            {c.label}
          </option>
        ))}
        <option value="manual">手で入れる</option>
      </select>
      {manual ? (
        <>
          <label className="inline-flex items-center gap-1">
            申請年月日
            <input
              type="date"
              value={on}
              disabled={!canEdit}
              onChange={(e) => setOn(e.target.value)}
              onBlur={saveManual}
              className="min-h-[28px] rounded border border-border bg-surface px-1"
            />
          </label>
          <label className="inline-flex items-center gap-1">
            受付番号
            <input
              value={no}
              disabled={!canEdit}
              onChange={(e) => setNo(e.target.value)}
              onBlur={saveManual}
              placeholder="例: 福オンCV26009566"
              className="min-h-[28px] w-40 rounded border border-border bg-surface px-1"
            />
          </label>
        </>
      ) : (
        hit >= 0 && <span className="text-muted">一覧表には「{value.on}」「{value.no}」と書きます</span>
      )}
      {candidates.length === 0 && !manual && <span className="text-seal">1年以内の申請が見つかりません。「手で入れる」で入れてください。</span>}
    </div>
  );
}

