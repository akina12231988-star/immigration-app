"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSearch, Loader2, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOnboardingDocDownloadUrl } from "@/app/(app)/onboarding/actions";
import { extractPdfTextLines, pdfLinesInReadingOrder } from "@/lib/pdf-text-lines";
import {
  buildPdfCheckItems,
  checkPdfText,
  pdfCheckHeadline,
  pdfCheckSummary,
  type PdfCheckOrganization,
  type PdfCheckResult,
  type PdfCheckWorker,
} from "@/lib/pdf-doc-check";
import { errorMessage } from "@/lib/errors";
import type { OnboardingDocumentRow } from "@/types/db";

// 添付したPDFの記載チェック。
// 添付されているPDFの文字を読み、外国人と所属機関の登録内容がそのまま書かれているかを見る。
// 別人の書類が混ざっていないか、引っ越し前の住所のままではないか、といった取り違えを見つける。
// 読み取り（pdfjs）も照合も端末の中で終わり、外部へは送らない。

type FileCheck =
  | { id: string; fileName: string; label: string; kind: "ok"; results: PdfCheckResult[] }
  | { id: string; fileName: string; label: string; kind: "noText" }
  | { id: string; fileName: string; label: string; kind: "error"; message: string };

function isPdf(d: OnboardingDocumentRow): boolean {
  return d.mime_type === "application/pdf" || /\.pdf$/i.test(d.file_name ?? "");
}

export function PrepPdfCheck({
  worker,
  orgId,
  docs,
}: {
  worker: PdfCheckWorker;
  orgId: string | null;
  docs: OnboardingDocumentRow[]; // この申請準備で添付されている書類
}) {
  const [checks, setChecks] = useState<FileCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 実体のあるPDFだけが対象（リンクで登録した書類・画像は読めない）。同じファイルは1回だけ
  const pdfDocs = [...new Map(docs.filter((d) => d.storage_path && isPdf(d)).map((d) => [d.id, d])).values()];
  const imageCount = docs.filter((d) => d.storage_path && !isPdf(d)).length;

  // 照合する項目（外国人＋所属機関の登録内容）
  const loadItems = async () => {
    let org: PdfCheckOrganization | null = null;
    if (orgId) {
      const { data } = await createClient()
        .from("organizations")
        .select("name, address, tel, representative")
        .eq("id", orgId)
        .maybeSingle();
      org = (data as PdfCheckOrganization | null) ?? null;
    }
    return buildPdfCheckItems(worker, org);
  };

  // 手元のPDFを選んでチェックする（添付する前に確かめたいとき・添付が読めなかったとき）
  const checkPickedFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const items = await loadItems();
      const head = { id: `local-${file.name}`, fileName: file.name, label: file.name };
      const text = pdfLinesInReadingOrder(await extractPdfTextLines(await file.arrayBuffer())).join("\n");
      setChecks([
        text.trim()
          ? { ...head, kind: "ok", results: checkPdfText(items, text) }
          : { ...head, kind: "noText" },
      ]);
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
      const out: FileCheck[] = [];
      for (const d of pdfDocs) {
        const head = { id: d.id, fileName: d.file_name, label: d.label };
        try {
          const res = await getOnboardingDocDownloadUrl(d.id);
          if (!res.ok) {
            out.push({ ...head, kind: "error", message: res.message });
            continue;
          }
          const buf = await (await fetch(res.url)).arrayBuffer();
          const text = pdfLinesInReadingOrder(await extractPdfTextLines(buf)).join("\n");
          out.push(
            text.trim()
              ? { ...head, kind: "ok", results: checkPdfText(items, text) }
              : { ...head, kind: "noText" },
          );
        } catch (e) {
          out.push({ ...head, kind: "error", message: errorMessage(e, "読み取れませんでした") });
        }
      }
      setChecks(out);
    } catch (e) {
      setError(errorMessage(e, "チェックに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <FileSearch size={15} className="text-brand" />
        添付PDFの記載チェック
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
        {/* 添付前に確かめたいとき・添付が読めなかったときは、手元のPDFを選べる */}
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
        添付したPDFの文字を読んで、外国人の氏名・フリガナ・生年月日・在留カード番号・国籍・住所と、
        所属機関の名称・住所・電話番号・代表者が、そのまま書かれているかを見ます。
        別人の書類が混ざっていないか、引っ越し前の住所のままではないかの確認に使ってください。
        読み取りは<span className="font-bold">この端末の中だけ</span>で行い、外部へは送りません。
        紙をスキャンした・写真で撮ったPDFは文字が入っていないため読めません。
        「見つからない」は<span className="font-bold">間違いとは限りません</span>
        （その書類に元々書かれていない項目のことがあります）。
        {imageCount > 0 && `画像で添付した${imageCount}件は読めないため、この一覧に出ません。`}
      </p>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">
          {error}
        </p>
      )}

      {checks && (
        <ul className="mt-2 flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.id} className="rounded-lg border border-border/60 p-2">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="min-w-0 break-all">{c.label || c.fileName}</span>
                {c.kind === "ok" && (
                  <span
                    className={
                      pdfCheckSummary(c.results).different > 0 ||
                      pdfCheckSummary(c.results).missingImportant > 0
                        ? "text-seal"
                        : "text-status-approved-fg"
                    }
                  >
                    {pdfCheckHeadline(pdfCheckSummary(c.results))}
                  </span>
                )}
                {c.kind === "noText" && (
                  <span className="font-normal text-muted">
                    文字が入っていないPDF（スキャン・写真）のため読めません
                  </span>
                )}
                {c.kind === "error" && <span className="text-seal">{c.message}</span>}
              </p>
              {c.kind === "ok" && (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {c.results.map((r) => (
                    <li
                      key={r.key}
                      className={`flex items-center gap-1 text-[11px] ${
                        r.status === "different"
                          ? "font-bold text-seal"
                          : r.status === "missing" && r.important
                            ? "text-seal"
                            : "text-muted"
                      }`}
                    >
                      {r.status === "found" ? (
                        <Check size={11} className="text-status-approved-fg" />
                      ) : r.status === "different" ? (
                        <AlertTriangle size={11} />
                      ) : (
                        <Minus size={11} />
                      )}
                      {r.label}
                      {r.status === "different" && `: ${r.found.join("・")}（登録は ${r.value}）`}
                      {r.status === "missing" && ": 見つかりません"}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
