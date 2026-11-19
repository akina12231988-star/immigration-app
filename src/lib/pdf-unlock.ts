// 保護（暗号化）された PDF を、書き込める PDF に作り直す（ブラウザで使う）。
// 国税庁などの様式には「変更不可」の保護が付いたものがあり、そのままでは pdf-lib で書き込むと壊れた PDF になる。
// pdfjs で各ページを画像にして、新しい PDF（同じ大きさのページ）に貼り直す。
// 印刷に十分な解像度（既定 3 倍 ≒ 216dpi）で描く。保護が無い PDF はそのまま返す。
import { PDFDocument } from "pdf-lib";

export async function isEncryptedPdf(bytes: ArrayBuffer): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.isEncrypted;
  } catch {
    return false;
  }
}

export async function unlockPdfForFilling(
  file: File,
  scale = 3,
): Promise<{ file: File; converted: boolean }> {
  const bytes = await file.arrayBuffer();
  if (!(await isEncryptedPdf(bytes))) return { file, converted: false };

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  // 埋め込みでない日本語の文字の表（cMap）は public/pdfjs/cmaps に置いてある（pdfjs-dist の cmaps をそのまま）
  const src = await pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: "/pdfjs/cmaps/", cMapPacked: true }).promise;
  const out = await PDFDocument.create();
  for (let i = 1; i <= src.numPages; i++) {
    const page = await src.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDFを画像にできませんでした");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PDFを画像にできませんでした"))), "image/png"),
    );
    const img = await out.embedPng(await png.arrayBuffer());
    const p = out.addPage([base.width, base.height]);
    p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
  }
  const saved = await out.save();
  return {
    file: new File([saved as BlobPart], file.name, { type: "application/pdf" }),
    converted: true,
  };
}
