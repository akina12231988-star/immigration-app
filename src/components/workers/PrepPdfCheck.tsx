"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSearch, Loader2, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOnboardingDocDownloadUrl } from "@/app/(app)/onboarding/actions";
import { extractPdfTextLines } from "@/lib/pdf-text-lines";
import { loadApplicationCopyData } from "@/lib/supabase/queries/application-copy";
import { normalizeOrganizationIntake } from "@/lib/organization-intake";
import { toCalcHistory } from "@/lib/supabase/queries/histories";
import { mergeCustodianInfo, mergeSupportOrgLists } from "@/lib/custody";
import { buildApplicationCopyGroups } from "@/lib/application-copy";
import {
  buildPrepCheckItems,
  checkPdfPages,
  pdfCheckSummary,
  type PdfCheckItem,
  type PdfCheckPage,
  type PdfCheckResult,
} from "@/lib/pdf-doc-check";
import { errorMessage } from "@/lib/errors";
import type { OnboardingDocumentRow } from "@/types/db";

// 入管へ出す完成した書類の記載チェック。
//
// 申請準備の「申請書に貼る情報」（＝この申請で書くことになっている値）を、
// 添付した完成書類のPDFの文字と1項目ずつ突き合わせる。
// 書類一式は1つの束なので、どのページに書かれていたかも出す。
// 読み取り（pdfjs）も照合もこの端末の中で終わり、外部へは送らない。

interface FileText {
  id: string;
  fileName: string;
  label: string;
  pages: PdfCheckPage[];
}

interface FileProblem {
  id: string;
  label: string;
  reason: string;
}

interface CheckReport {
  results: PdfCheckResult[];
  files: { label: string; pages: number }[];
  problems: FileProblem[];
  itemCount: number;
}

// 見つかったページは何十件にもなるので、はじめの数件だけ出す
function wherText(where: string[], max = 6): string {
  return where.length <= max
    ? where.join("・")
    : `${where.slice(0, max).join("・")} ほか${where.length - max}ページ`;
}

function isPdf(d: OnboardingDocumentRow): boolean {
  return d.mime_type === "application/pdf" || /\.pdf$/i.test(d.file_name ?? "");
}

// PDFの文字を1ページずつに分ける（どのページに書かれていたかを出すため）
async function readPdfPages(buf: ArrayBuffer, name: string, single: boolean): Promise<PdfCheckPage[]> {
  const lines = await extractPdfTextLines(buf);
  const byPage = new Map<number, typeof lines>();
  for (const l of lines) (byPage.get(l.page) ?? byPage.set(l.page, []).get(l.page)!).push(l);
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, ls]) => ({
      label: single ? `${page + 1}ページ` : `${name} ${page + 1}ページ`,
      text: [...ls].sort((a, b) => b.y - a.y || a.x - b.x).map((l) => l.text).join("\n"),
    }));
}

export function PrepPdfCheck({
  workerId,
  orgId,
  todoNo,
  desiredStatus,
  docs,
  refreshKey = 0,
}: {
  workerId: string;
  orgId: string | null;
  todoNo: string;
  desiredStatus?: string; // 希望する在留資格（申請種別から）
  docs: OnboardingDocumentRow[]; // 入管へ出す完成した書類（申請する書類）
  refreshKey?: number; // 申請準備の内容を保存したら読み直す
}) {
  const [report, setReport] = useState<CheckReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 申請準備の内容を保存し直したら、前の結果は古くなるので消す
  const [seenKey, setSeenKey] = useState(refreshKey);
  if (seenKey !== refreshKey) {
    setSeenKey(refreshKey);
    setReport(null);
  }

  // 実体のあるPDFだけが対象（リンクで登録した書類・画像は読めない）
  const pdfDocs = [...new Map(docs.filter((d) => d.storage_path && isPdf(d)).map((d) => [d.id, d])).values()];
  const otherCount = docs.filter((d) => !d.storage_path || !isPdf(d)).length;

  // 照合する項目（申請準備の「申請書に貼る情報」＝この申請で書くことになっている値）
  const loadItems = async (): Promise<PdfCheckItem[]> => {
    const data = await loadApplicationCopyData(createClient(), { workerId, orgId, todoNo });
    if (!data.worker) return [];
    const groups = buildApplicationCopyGroups({
      worker: data.worker,
      org: data.org,
      intake: data.org ? normalizeOrganizationIntake(data.org.intake) : null,
      wages: data.wages,
      histories: data.histories.map(toCalcHistory),
      planDates: data.planDates,
      desiredStatus,
      custodian: mergeCustodianInfo(data.custodian),
      interpreters: mergeSupportOrgLists(data.custodian).interpreters,
    });
    return buildPrepCheckItems(
      groups.flatMap((g) => g.items.map((i) => ({ label: i.label, value: i.value }))),
      // この書類一式に必ず書かれているはずの値（見つからないときに注意色で出す）
      [
        data.worker.name,
        data.worker.nationality,
        data.worker.birth ?? "",
        data.worker.residence_card_no ?? "",
        data.org?.name ?? "",
      ],
    );
  };

  const buildReport = (items: PdfCheckItem[], read: FileText[], problems: FileProblem[]): CheckReport => {
    const pages = read.flatMap((f) => f.pages);
    return {
      results: pages.length > 0 ? checkPdfPages(items, pages) : [],
      files: read.map((f) => ({ label: f.label || f.fileName, pages: f.pages.length })),
      problems,
      itemCount: items.length,
    };
  };

  // 手元のPDFを選んでチェックする（添付する前に確かめたいとき）
  const checkPickedFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const items = await loadItems();
      const pages = await readPdfPages(await file.arrayBuffer(), file.name, true);
      setReport(
        buildReport(
          items,
          pages.length > 0 ? [{ id: "local", fileName: file.name, label: file.name, pages }] : [],
          pages.length > 0
            ? []
            : [{ id: "local", label: file.name, reason: "文字が入っていないPDF（スキャン・写真）のため読めません" }],
        ),
      );
    } catch (e) {
      setError(errorMessage(e, "読み取れませんでした"));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const items = await loadItems();
      const read: FileText[] = [];
      const problems: FileProblem[] = [];
      for (const d of pdfDocs) {
        const label = d.label || d.file_name;
        try {
          const res = await getOnboardingDocDownloadUrl(d.id);
          if (!res.ok) {
            problems.push({ id: d.id, label, reason: res.message });
            continue;
          }
          const buf = await (await fetch(res.url)).arrayBuffer();
          const pages = await readPdfPages(buf, label, pdfDocs.length === 1);
          if (pages.length === 0) {
            problems.push({
              id: d.id,
              label,
              reason: "文字が入っていないPDF（スキャン・写真）のため読めません",
            });
            continue;
          }
          read.push({ id: d.id, fileName: d.file_name, label, pages });
        } catch (e) {
          problems.push({ id: d.id, label, reason: errorMessage(e, "読み取れませんでした") });
        }
      }
      setReport(buildReport(items, read, problems));
    } catch (e) {
      setError(errorMessage(e, "チェックに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const summary = report ? pdfCheckSummary(report.results) : null;
  const differents = report?.results.filter((r) => r.status === "different") ?? [];
  const missings = report?.results.filter((r) => r.status === "missing") ?? [];
  const founds = report?.results.filter((r) => r.status === "found") ?? [];

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <FileSearch size={15} className="text-brand" />
        添付した完成書類の記載チェック
        {pdfDocs.length > 0 && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
            {busy ? "読み取り中…" : `添付のPDF ${pdfDocs.length}件をチェック`}
          </button>
        )}
        {/* 添付する前に確かめたいときは、手元のPDFを選べる */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-brand disabled:opacity-50 ${
            pdfDocs.length > 0 ? "" : "ml-auto"
          }`}
        >
          手元のPDFを選ぶ
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void checkPickedFile(f);
          }}
        />
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        上に添付した完成書類の文字を1ページずつ読んで、
        <span className="font-bold">この申請準備の「申請書に貼る情報」</span>
        （氏名・生年月日・国籍・住居地・旅券番号・在留カード番号・所属機関の名称・住所・電話番号・報酬・雇用契約期間など）が
        そのとおり書かれているかを、項目ごとに見ます。書かれていたページ番号も出します。
        別人の書類が混ざっていないか、「株式会社」と「有限会社」のように会社の種類が違っていないか、
        引っ越し前の住所のままではないかの確認に使ってください。
        読み取りは<span className="font-bold">この端末の中だけ</span>で行い、外部へは送りません。
        紙をスキャンしただけのPDFは文字が入っていないため読めません
        （Acrobat の「スキャンとOCR」などで文字を付けてから添付すると読めるようになります）。
        {otherCount > 0 && `リンク・画像で登録した${otherCount}件は読めないため、対象になりません。`}
      </p>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">
          {error}
        </p>
      )}

      {report && (
        <div className="mt-2 flex flex-col gap-2">
          {/* 読んだファイルと、読めなかったファイル */}
          <p className="text-[11px] text-muted">
            {report.files.length > 0
              ? `${report.files.map((f) => `${f.label}（${f.pages}ページ）`).join("・")} を読み、申請準備の${report.itemCount}項目と照合しました。`
              : "読めたPDFがありませんでした。"}
          </p>
          {report.problems.map((p) => (
            <p key={p.id} className="text-[11px] text-muted">
              <span className="font-bold">{p.label}</span>: {p.reason}
            </p>
          ))}

          {summary && report.results.length > 0 && (
            <p
              className={`text-[11px] font-bold ${
                summary.different > 0 || summary.missingImportant > 0
                  ? "text-seal"
                  : "text-status-approved-fg"
              }`}
            >
              {summary.different > 0
                ? `申請準備の内容と違う値が ${summary.different}件 見つかりました`
                : summary.missingImportant > 0
                  ? `本人・所属機関の情報が書かれていない項目が ${summary.missingImportant}件 あります`
                  : `申請準備の内容と食い違うところは見つかりませんでした（一致 ${summary.found}/${summary.total}項目）`}
            </p>
          )}

          {/* 違う値（いちばん見てほしいもの） */}
          {differents.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg border border-seal/40 bg-seal/5 p-2">
              {differents.map((r) => (
                <li key={r.key} className="text-[11px] leading-relaxed text-seal">
                  <span className="flex items-center gap-1 font-bold">
                    <AlertTriangle size={11} className="shrink-0" />
                    {r.label}
                  </span>
                  <span className="ml-4 block">
                    書類: {r.found.join("・")}（{wherText(r.where)}） / 申請準備: {r.value}
                    {r.alsoFound.length > 0 &&
                      ` ※ほかの${r.alsoFound.length}ページ（${wherText(r.alsoFound, 4)}）では申請準備どおりでした`}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* 書かれていない項目（その書類に元々無いこともあるので、たたんでおく） */}
          {missings.length > 0 && (
            <details className="rounded-lg border border-border/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold">
                書かれていない項目 {missings.length}件
                {summary && summary.missingImportant > 0 && (
                  <span className="text-seal">（うち本人・所属機関の情報 {summary.missingImportant}件）</span>
                )}
              </summary>
              <p className="mt-1 text-[11px] text-muted">
                書類に元々書かない項目や、読み取り（OCR）で文字が崩れている項目もあります。
                <span className="font-bold">間違いとは限りません。</span>
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {missings.map((r) => (
                  <li
                    key={r.key}
                    className={`flex items-center gap-1 text-[11px] ${r.important ? "font-bold text-seal" : "text-muted"}`}
                  >
                    <Minus size={11} className="shrink-0" />
                    {r.label}: {r.value}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* 一致した項目 */}
          {founds.length > 0 && (
            <details className="rounded-lg border border-border/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-status-approved-fg">
                申請準備どおり書かれていた項目 {founds.length}件
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {founds.map((r) => (
                  <li key={r.key} className="flex items-start gap-1 text-[11px] text-muted">
                    <Check size={11} className="mt-0.5 shrink-0 text-status-approved-fg" />
                    <span>
                      <span className="font-bold text-foreground">{r.label}</span>: {r.value}
                      <span className="text-muted">（{wherText(r.where)}）</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
