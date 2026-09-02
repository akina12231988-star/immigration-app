"use client";

import { useRef, useState } from "react";
import { Check, Download, FileSearch, Loader2 } from "lucide-react";
import {
  checkInvoiceLines,
  type InvoiceCheckResult,
  type PdfTextLine,
} from "@/lib/invoice-pdf-check";
import { FileDropArea } from "@/components/ui/FileDropArea";
import type { MonthlyBillingOrg } from "@/lib/monthly-billing";
import { formatSalesYen } from "@/lib/sales";
import { downloadBlob } from "@/lib/xlsx-export";
import { errorMessage } from "@/lib/errors";

// 請求書PDF（freee）をアップロードして在籍名簿と照合し、
// 支援代・サポート代の行に名簿のNo.を書き込んだPDFをダウンロードする。
// これまで手書きでNo.を振っていた作業（書き間違い・振り忘れが起きやすい）の置き換え

// PDFの文字を行ごとに取り出す。pdfjs は重いので押されたときだけ読み込む
async function extractTextLines(data: ArrayBuffer): Promise<PdfTextLine[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const lines: PdfTextLine[] = [];
  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const content = await page.getTextContent();
    // 同じ高さ（y）の文字を1つの行にまとめる。表の1行は同じベースラインに並ぶ
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      const key = Math.round(y);
      (byY.get(key) ?? byY.set(key, []).get(key)!).push({ x, str: item.str });
    }
    for (const [y, items] of byY) {
      items.sort((a, b) => a.x - b.x);
      lines.push({
        page: p,
        x: items[0].x,
        y,
        text: items.map((i) => i.str).join(" "),
      });
    }
  }
  await task.destroy();
  return lines;
}

// 照合の結果からNo.を書き込んだPDFを作る（左余白・見本と同じ位置）
async function annotatePdf(
  data: ArrayBuffer,
  result: InvoiceCheckResult,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(data);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const size = 8;
  for (const m of result.matched) {
    const page = pages[m.line.page];
    if (!page) continue;
    const label = `No.${m.no}`;
    // 表の左端（摘要の文字の位置）の少し左に、右ぞろえで書く
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: Math.max(6, m.line.x - width - 8),
      y: m.line.y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }
  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export function InvoicePdfCheck({
  org,
  notes,
}: {
  org: MonthlyBillingOrg;
  // 名簿のメモ（請求しない理由。worker.id → メモ）。
  // メモがある人は請求書に無くても漏れではなく「請求しない人」として出す
  notes: Record<string, string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<InvoiceCheckResult | null>(null);
  const [annotated, setAnnotated] = useState<Blob | null>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    setAnnotated(null);
    setFileName(file.name);
    try {
      const data = await file.arrayBuffer();
      // pdfjs は渡したバッファを作業用に持っていってしまう（空になる）ので、コピーを渡す
      const lines = await extractTextLines(data.slice(0));
      const checked = checkInvoiceLines(org.rows, lines, notes);
      if (checked.matched.length === 0) {
        setError(
          "支援代・サポート代の行が見つかりませんでした。freeeから出した請求書PDFか、所属機関が合っているかご確認ください",
        );
        return;
      }
      setResult(checked);
      // No.書き込みは同じPDFにもう一度触るので、元のバイト列をそのまま使う
      setAnnotated(await annotatePdf(data, checked));
    } catch (err) {
      setError(errorMessage(err, "請求書PDFの読み取りに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!annotated) return;
    downloadBlob(annotated, `No付き_${fileName}`);
  };

  const ok =
    result &&
    result.missing.length === 0 &&
    result.unknown.length === 0 &&
    result.notedButBilled.length === 0;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // 同じファイルをもう一度選べるように
          if (f) void onFile(f);
        }}
      />
      {/* ボタンからでも、この枠にPDFをドラッグ＆ドロップしても照合できる */}
      <FileDropArea
        onFiles={(files) => {
          const f = files[0];
          if (f) void onFile(f);
        }}
        disabled={busy}
        title="請求書PDFをここにドロップしても照合できます"
        className="rounded-lg"
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="freeeの請求書PDFをアップロード（この枠にドラッグ＆ドロップも可）して名簿と照合し、支援代・サポート代の行に名簿のNo.を書き込んだPDFを作ります"
          className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-bold text-brand disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
          請求書と照合
        </button>
      </FileDropArea>

      {(error || result) && (
        <div className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs">
          {error && <p className="font-bold text-seal">{error}</p>}
          {result && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1 font-bold">
                {ok ? (
                  <>
                    <Check size={14} className="text-status-approved-fg" />
                    <span className="text-status-approved-fg">
                      漏れなし（{result.matched.length}行にNo.を振りました）
                    </span>
                  </>
                ) : (
                  <span>
                    {fileName} と名簿を照合しました（No.を振った行 {result.matched.length}）
                  </span>
                )}
              </p>
              {result.missing.length > 0 && (
                <div className="text-seal">
                  <p className="font-bold">請求書に載っていない人（請求漏れの疑い）:</p>
                  {result.missing.map((m) => (
                    <p key={m.no}>
                      No.{m.no} {m.name}（支援費請求額 {formatSalesYen(m.amount)}）
                    </p>
                  ))}
                </div>
              )}
              {result.unknown.length > 0 && (
                <div className="text-seal">
                  <p className="font-bold">名簿にいない人の行（対象月・所属機関違いの疑い）:</p>
                  {result.unknown.map((u, i) => (
                    // 氏名を切り出せなかった行は摘要をそのまま出す（何の行か分かるように）
                    <p key={i}>{u.name || u.text}</p>
                  ))}
                </div>
              )}
              {result.notedButBilled.length > 0 && (
                <div className="text-seal">
                  <p className="font-bold">メモでは請求しないはずなのに請求書に載っている人:</p>
                  {result.notedButBilled.map((m) => (
                    <p key={m.no}>
                      No.{m.no} {m.name}　メモ: {m.note}
                    </p>
                  ))}
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className="text-muted">
                  <p className="font-bold">メモにより請求しない人（漏れではありません）:</p>
                  {result.skipped.map((m) => (
                    <p key={m.no}>
                      No.{m.no} {m.name}（名簿の請求額 {formatSalesYen(m.amount)}）　メモ: {m.note}
                    </p>
                  ))}
                </div>
              )}
              {result.matched.some((m) => m.amountMismatch) && (
                <div className="text-seal">
                  <p className="font-bold">金額が名簿と違う行:</p>
                  {result.matched
                    .filter((m) => m.amountMismatch)
                    .map((m) => (
                      <p key={`${m.no}-${m.line.page}-${m.line.y}`}>
                        No.{m.no} {m.name}　請求書 {formatSalesYen(m.line.amount ?? 0)} ／ 名簿{" "}
                        {formatSalesYen(m.rosterAmount)}
                      </p>
                    ))}
                </div>
              )}
              <div>
                <button
                  type="button"
                  disabled={!annotated}
                  onClick={download}
                  className="flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
                >
                  <Download size={14} />
                  No.付きPDFをダウンロード
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
