"use client";

import { Fragment, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Eye, Loader2, Paperclip, Printer, Trash2 } from "lucide-react";
import { FileDropArea } from "@/components/ui/FileDropArea";
import { isRefFormItem, languageForNationality, missingBundledRefForms, pickRefFormTemplate, refFormName } from "@/lib/ref-form";
import { registerBundledRefForms } from "@/app/(app)/ref-forms/actions";
import { SUBMISSION_PDF_TEMPLATES, canFillSubmissionPdf, fillSubmissionPdf, submissionPdfTables } from "@/lib/submission-pdf";
import { RefFormRowBar, RefFormTemplatesDialog, refFormHref, useRefFormTemplates } from "@/components/ref-forms/RefFormPanel";
import type { OnboardingDocumentRow } from "@/types/db";
import { SupportOrgFileAttachments } from "@/app/(app)/support-org/SupportOrgFileAttachments";
import { SUPPORT_ORG_LISTING_FILE_KIND } from "@/lib/support-org-info";
import {
  SUBMISSION_TABLE_ORDER,
  canonicalSubmissionKey,
  submissionLink,
  submissionListTitle,
  SUBMISSION_TABLE_TITLES,
  submissionListPrintHtml,
  type SubmissionRow,
  type SubmitMark,
} from "@/lib/submission-list";

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
  // 参考様式の作成（ひな形に書き込んだPDF）に使う。渡したときだけ参考様式の欄を出す
  workerId?: string;
  nationality?: string;
  orgId?: string | null; // 申請準備中の所属機関（所属機関別のひな形を使う・登録する）
}) {
  const [openNotes, setOpenNotes] = useState(false);
  const refForms = useRefFormTemplates();
  const [managing, setManaging] = useState<SubmissionRow | null>(null);
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
  const refReady = refRows.filter((r) => pickRefFormTemplate(refForms.templates, refKey(r), nationality, orgId));
  const refSignReady = refReady.filter(
    (r) => (pickRefFormTemplate(refForms.templates, refKey(r), nationality, orgId)?.sign_pages.length ?? 0) > 0,
  );
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
          <a
            href={refReady.length > 0 ? refFormHref(workerId, refReady.map(refKey), "all", refOff, todoNo) : undefined}
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
            href={refSignReady.length > 0 ? refFormHref(workerId, refSignReady.map(refKey), "sign", refOff, todoNo) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={refSignReady.length === 0}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 font-bold ${
              refSignReady.length > 0 ? "border border-seal bg-surface text-seal" : "pointer-events-none bg-border text-muted"
            }`}
          >
            ✍ 本人に署名してもらうページだけ（{refSignReady.length}件）
          </a>
          {refForms.error && <span className="text-seal">{refForms.error}</span>}
          {refReady.length < refRows.length && (
            <span className="text-muted">ひな形が未登録の様式は入りません（行の「ひな形・記入位置」から登録）</span>
          )}
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
                        <td className="border-t border-border px-2 py-1.5">
                          {r.sub && <span className="mr-1 font-bold">{r.sub}</span>}
                          {r.label}
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
                              />
                            </div>
                          )}
                          {r.mark === "有" && renderAction && <div className="mt-1.5">{renderAction(r)}</div>}
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
}: {
  row: SubmissionRow;
  canEdit: boolean;
  busy: boolean;
  docs: { id: string; label: string; inList: boolean; satisfied: boolean; fileCount: number }[];
  attachFiles: OnboardingDocumentRow[] | null; // null はこの行に添付しない書類
  onAttach: () => void;
  onDrop: (files: FileList) => void;
  onPreview: (f: OnboardingDocumentRow) => void;
  onRemove: (f: OnboardingDocumentRow) => void;
}) {
  const section = submissionLink(row.key)?.section;
  // 「人材サービス総合サイト」の画面は、だれの申請でも同じ（当社の掲載画面）。全員共通で1つ登録して使う
  const sharedListing = canonicalSubmissionKey(row.key) === "t1-7-2";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-2 text-[11px]">
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
                必要な書類で添付 →
              </a>
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
              <span className={docs.length > 0 || sharedListing ? "text-muted" : "font-bold text-seal"}>
                {sharedListing
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
