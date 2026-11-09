import { PDFDocument } from "pdf-lib";

// 画像（JPEG/PNG）と PDF をひとつの PDF にまとめる。
// 会社からの書類の依頼で、1人分の資料（扶養控除申告書・扶養証明書 など）を
// 1つの PDF にして会社へ送るのに使う。画像は A4（向きは画像に合わせる）に収めて1ページにする。

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 20;

export type PdfPart =
  | { kind: "pdf"; bytes: ArrayBuffer | Uint8Array; name?: string }
  | { kind: "jpg" | "png"; bytes: ArrayBuffer | Uint8Array; name?: string };

// PDF のページを画像にしたもの（大きさはポイント＝PDF の元のページの大きさ）
export interface RasterPage {
  jpg: Uint8Array;
  width: number;
  height: number;
}

export async function mergePdfParts(
  parts: PdfPart[],
  options: {
    // pdf-lib で読めない・ページを写せない PDF（スキャンアプリで作ったものなど、中の構造が壊れているもの）を
    // ページごとの画像にする関数（ブラウザでは pdf.js で描く）。渡すと、そういう PDF も画像にしてまとめる
    rasterize?: (bytes: Uint8Array) => Promise<RasterPage[]>;
  } = {},
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    if (part.kind === "pdf") {
      // pdf-lib は読んだ ArrayBuffer を手放すことがあるので、画像にするとき用に写しを持っておく
      const copy = new Uint8Array(part.bytes instanceof Uint8Array ? part.bytes : new Uint8Array(part.bytes)).slice();
      try {
        const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const p of pages) out.addPage(p);
      } catch (err) {
        if (!options.rasterize) throw pdfPartError(part, err);
        let raster: RasterPage[];
        try {
          raster = await options.rasterize(copy);
        } catch (err2) {
          throw pdfPartError(part, err2);
        }
        for (const r of raster) {
          const img = await out.embedJpg(r.jpg);
          const page = out.addPage([r.width, r.height]);
          page.drawImage(img, { x: 0, y: 0, width: r.width, height: r.height });
        }
      }
      continue;
    }
    const img = part.kind === "jpg" ? await out.embedJpg(part.bytes) : await out.embedPng(part.bytes);
    // 横長の画像は A4 横、縦長は A4 縦に載せる（縦横比は保つ）
    const target = img.width > img.height ? { width: A4.height, height: A4.width } : A4;
    const scale = Math.min((target.width - MARGIN * 2) / img.width, (target.height - MARGIN * 2) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = out.addPage([target.width, target.height]);
    page.drawImage(img, { x: (target.width - w) / 2, y: (target.height - h) / 2, width: w, height: h });
  }
  return out.save();
}

// どのファイルでつまずいたかが分かるエラーにする（「Expected instance of …」だけでは分からないため）
function pdfPartError(part: PdfPart, err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(`PDF「${part.name || "（名前なし）"}」をまとめられませんでした（${detail}）`);
}

// ブラウザで取ってきたファイル（Blob）を PdfPart にする。
// JPEG/PNG/PDF はそのまま、それ以外の画像（WebP・HEIC など）はキャンバスで JPEG に変換する。
// 画像でも PDF でもないものは null（まとめられない）
export async function blobToPdfPart(blob: Blob, fileName = ""): Promise<PdfPart | null> {
  const type = blob.type || "";
  const lower = fileName.toLowerCase();
  const name = fileName || undefined;
  if (type === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", bytes: await blob.arrayBuffer(), name };
  if (type === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { kind: "jpg", bytes: await blob.arrayBuffer(), name };
  if (type === "image/png" || lower.endsWith(".png")) return { kind: "png", bytes: await blob.arrayBuffer(), name };
  if (!type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const jpg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!jpg) return null;
    return { kind: "jpg", bytes: await jpg.arrayBuffer(), name };
  } catch {
    return null;
  }
}

// ブラウザで PDF をページごとの JPEG にする（pdf.js）。pdf-lib で写せない PDF をまとめるときに使う
export async function rasterizePdfInBrowser(bytes: Uint8Array): Promise<RasterPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const out: RasterPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 2 }); // 印刷しても読める細かさ
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像にできませんでした");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("画像にできませんでした");
    out.push({ jpg: new Uint8Array(await blob.arrayBuffer()), width: base.width, height: base.height });
  }
  return out;
}
