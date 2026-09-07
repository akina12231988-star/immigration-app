"use client";

import type { PdfTextLine } from "@/lib/invoice-pdf-check";

// PDFの文字を「行」ごとに取り出す（同じ高さに並ぶ文字を1行にまとめる）。
// 請求書PDFの照合と、特定技能総合保険の申込内容の照合で共通に使う。
// pdfjs は重いので、押されたときだけ読み込む（動的 import）。
export async function extractPdfTextLines(data: ArrayBuffer): Promise<PdfTextLine[]> {
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

// 読む順（上から下へ）に並べ替えた行の文字。
// PDFの座標は下が0なので、y の大きい行が上になる
export function pdfLinesInReadingOrder(lines: PdfTextLine[]): string[] {
  return [...lines]
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    .map((l) => l.text);
}
