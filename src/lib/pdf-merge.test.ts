import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfParts } from "./pdf-merge";

async function pdfWithPages(n: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([400, 300]);
  return doc.save();
}

// 1×1 の PNG（赤）
const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

describe("mergePdfParts", () => {
  it("PDF のページと画像のページを順番どおりにひとつの PDF にする", async () => {
    const a = await pdfWithPages(2);
    const b = await pdfWithPages(1);
    const merged = await mergePdfParts([
      { kind: "pdf", bytes: a },
      { kind: "png", bytes: PNG_1x1 },
      { kind: "pdf", bytes: b },
    ]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(4);
    // 画像のページは A4 縦（1×1 は縦長扱いではないが横長でもないので A4 縦）
    const { width, height } = doc.getPage(2).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});
