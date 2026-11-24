"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Download, FileUp, Loader2, Paperclip, X } from "lucide-react";
import { blobToPdfPart, mergePdfParts, rasterizePdfInBrowser, type PdfPart } from "@/lib/pdf-merge";
import { signedPageCountMessage, signedReplacePlan, type SignedFormPages } from "@/lib/signed-pages";
import { uploadOnboardingDoc } from "@/lib/onboarding-files";
import { submissionAttachKey } from "@/lib/submission-list";

export interface SignedImportEntry {
  key: string; // 様式のキー（ダウンロードしたときと同じ順に並べる）
  name: string; // 様式の名前（参考様式第1-5号 など）
  href: string; // その様式の全部のページの PDF（いまの内容で作る）
  signPages: number[] | undefined; // 署名ページ（0 始まり）。undefined = 全部のページ
  rowKey: string | null; // 差し替えた PDF を添付する提出書類一覧表の行（無ければダウンロードだけ）
  rowLabel: string;
}

interface Result {
  key: string;
  name: string;
  rowKey: string | null;
  rowLabel: string;
  replaced: number[]; // 差し替えたページ（0 始まり）
  pageCount: number;
  blob: Blob;
  url: string;
}

// 「本人に署名してもらうページだけ」をダウンロードして署名してもらったものを取り込み、
// 様式ごとの全部のページの PDF の署名ページだけを差し替えて、提出書類一覧表の行に添付する。
// 取り込むのは、ダウンロードしたときと同じ順・同じページ数のスキャン（PDF）か写真（1ページ1枚）
export function SignedPagesImport({
  workerId,
  entries,
  canEdit,
  onAttached,
}: {
  workerId: string;
  entries: SignedImportEntry[];
  canEdit: boolean;
  onAttached?: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "read" | "attach">(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // 閉じたら作った PDF の URL を手放す
  useEffect(
    () => () => {
      results?.forEach((r) => URL.revokeObjectURL(r.url));
    },
    [results],
  );

  const close = () => {
    setResults(null);
    setDone(null);
    setError(null);
  };

  const read = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy("read");
    setError(null);
    setDone(null);
    try {
      // 取り込んだファイル（PDF・写真）を選んだ順に1つの PDF にする（写真はファイル名の順）
      const list = [...files].sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
      const parts: PdfPart[] = [];
      for (const f of list) {
        const part = await blobToPdfPart(f, f.name);
        if (!part) throw new Error(`「${f.name}」は PDF でも画像でもないので取り込めません`);
        parts.push(part);
      }
      const scanned = await PDFDocument.load(await mergePdfParts(parts, { rasterize: rasterizePdfInBrowser }));

      // 様式ごとに、いまの内容で全部のページの PDF を作る
      const fulls: { entry: SignedImportEntry; doc: PDFDocument }[] = [];
      for (const e of entries) {
        const res = await fetch(e.href);
        if (!res.ok) throw new Error(`${e.name} の PDF を作れませんでした`);
        fulls.push({ entry: e, doc: await PDFDocument.load(await res.arrayBuffer()) });
      }
      const forms: SignedFormPages[] = fulls.map(({ entry, doc }) => ({
        key: entry.key,
        pageCount: doc.getPageCount(),
        signPages: entry.signPages,
      }));
      const { plans, total } = signedReplacePlan(forms);
      const nameOf = (k: string) => entries.find((e) => e.key === k)?.name ?? k;
      const msg = signedPageCountMessage(plans, total, scanned.getPageCount(), nameOf);
      if (msg) throw new Error(msg);

      const out: Result[] = [];
      for (const plan of plans) {
        const { entry, doc } = fulls.find((f) => f.entry.key === plan.key)!;
        const map = new Map(plan.replace);
        const pdf = await PDFDocument.create();
        for (let i = 0; i < doc.getPageCount(); i++) {
          const j = map.get(i);
          if (j == null) {
            const [p] = await pdf.copyPages(doc, [i]);
            pdf.addPage(p);
            continue;
          }
          // 署名したページを、元のページと同じ大きさに収めて置く（スキャンの大きさが違っても A4 のまま）
          const { width, height } = doc.getPage(i).getSize();
          const [emb] = await pdf.embedPages([scanned.getPage(j)]);
          const scale = Math.min(width / emb.width, height / emb.height);
          const w = emb.width * scale;
          const h = emb.height * scale;
          const page = pdf.addPage([width, height]);
          page.drawPage(emb, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
        }
        const blob = new Blob([(await pdf.save()) as BlobPart], { type: "application/pdf" });
        out.push({
          key: plan.key,
          name: entry.name,
          rowKey: entry.rowKey,
          rowLabel: entry.rowLabel,
          replaced: plan.replace.map(([p]) => p),
          pageCount: doc.getPageCount(),
          blob,
          url: URL.createObjectURL(blob),
        });
      }
      setResults(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り込めませんでした");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const attach = async () => {
    if (!results) return;
    const targets = results.filter((r) => r.rowKey);
    if (targets.length === 0) return;
    if (!window.confirm(`${targets.length}件の様式を、署名ページを差し替えた PDF にして各行に添付します（前の添付は差し替えます）。よろしいですか？`)) return;
    setBusy("attach");
    setError(null);
    try {
      for (const r of targets) {
        const file = new File([r.blob], `${r.name}（署名済み）.pdf`, { type: "application/pdf" });
        await uploadOnboardingDoc(workerId, { key: submissionAttachKey(r.rowKey!), label: r.rowLabel, num: 0 }, file);
      }
      await onAttached?.();
      setDone(`${targets.length}件の行に、署名ページを差し替えた PDF を添付しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "添付できませんでした");
    } finally {
      setBusy(null);
    }
  };

  const download = (r: Result) => {
    const a = document.createElement("a");
    a.href = r.url;
    a.download = `${r.name}（署名済み）.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => void read(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!canEdit || entries.length === 0 || busy != null}
        title="署名してもらったページ（スキャンした PDF か写真）を取り込むと、各様式の署名ページだけを差し替えて行に添付できます"
        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-seal bg-surface px-3 font-bold text-seal disabled:opacity-50"
      >
        {busy === "read" ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
        {busy === "read" ? "取り込み中…" : "署名したページを取り込んで差し替え"}
      </button>
      {error && !results && (
        <span role="alert" className="w-full rounded-lg bg-seal/10 px-2 py-1.5 font-bold text-seal">
          {error}
        </span>
      )}

      {results && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-4 text-sm shadow-xl">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 font-bold">署名ページを差し替えた PDF（{results.length}件）</h2>
              <button type="button" onClick={close} aria-label="閉じる" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-background">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-muted">
              取り込んだページを、ダウンロードしたときと同じ順に各様式の署名ページへ当てはめました。「開いて確認」で、署名したページが正しい場所に入っているかを見てから添付してください。
            </p>
            <ul className="flex flex-col gap-2">
              {results.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{r.name}</p>
                    <p className="text-[11px] text-muted">
                      全{r.pageCount}ページのうち {r.replaced.map((p) => p + 1).join("・")}ページ目を差し替え
                      {r.rowKey ? `／添付先: ${r.rowLabel}` : "／入管に出さない書類なのでダウンロードだけ"}
                    </p>
                  </div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand underline-offset-2 hover:underline">
                    開いて確認
                  </a>
                  <button type="button" onClick={() => download(r)} className="inline-flex items-center gap-1 text-xs font-bold text-brand">
                    <Download size={12} />
                    ダウンロード
                  </button>
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="rounded-lg bg-seal/10 px-2 py-1.5 text-xs font-bold text-seal">
                {error}
              </p>
            )}
            {done && <p className="rounded-lg bg-status-approved-bg px-2 py-1.5 text-xs font-bold text-status-approved-fg">{done}</p>}
            <div className="flex flex-wrap gap-2">
              {results.some((r) => r.rowKey) && !done && (
                <button
                  type="button"
                  onClick={() => void attach()}
                  disabled={busy != null}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 font-bold text-brand-foreground disabled:opacity-60"
                >
                  {busy === "attach" ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                  {busy === "attach" ? "添付中…" : `各行に添付する（${results.filter((r) => r.rowKey).length}件）`}
                </button>
              )}
              <button type="button" onClick={close} className="min-h-[44px] rounded-xl border border-border px-5 font-bold">
                {done ? "閉じる" : "やめる"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
