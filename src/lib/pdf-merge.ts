import { PDFDocument } from "pdf-lib";

// 画像（JPEG/PNG）と PDF をひとつの PDF にまとめる。
// 会社からの書類の依頼で、1人分の資料（扶養控除申告書・扶養証明書 など）を
// 1つの PDF にして会社へ送るのに使う。画像は A4（向きは画像に合わせる）に収めて1ページにする。

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 20;

export type PdfPart =
  | { kind: "pdf"; bytes: ArrayBuffer | Uint8Array }
  | { kind: "jpg" | "png"; bytes: ArrayBuffer | Uint8Array };

export async function mergePdfParts(parts: PdfPart[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    if (part.kind === "pdf") {
      const src = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
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

// ブラウザで取ってきたファイル（Blob）を PdfPart にする。
// JPEG/PNG/PDF はそのまま、それ以外の画像（WebP・HEIC など）はキャンバスで JPEG に変換する。
// 画像でも PDF でもないものは null（まとめられない）
export async function blobToPdfPart(blob: Blob, fileName = ""): Promise<PdfPart | null> {
  const type = blob.type || "";
  const lower = fileName.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return { kind: "pdf", bytes: await blob.arrayBuffer() };
  if (type === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { kind: "jpg", bytes: await blob.arrayBuffer() };
  if (type === "image/png" || lower.endsWith(".png")) return { kind: "png", bytes: await blob.arrayBuffer() };
  if (!type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const jpg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!jpg) return null;
    return { kind: "jpg", bytes: await jpg.arrayBuffer() };
  } catch {
    return null;
  }
}
