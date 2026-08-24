import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { normalizePdfToA4 } from "./pdf-normalize";

const A4W = 595.28;
const A4H = 841.89;

async function makePdf(pages: { w: number; h: number; rotate?: number }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const page = doc.addPage([p.w, p.h]);
    // 中身が空のページは埋め込めない（MissingPageContentsEmbeddingError）ため、線を1本引いておく
    page.drawLine({ start: { x: 10, y: 10 }, end: { x: 50, y: 50 } });
    if (p.rotate) page.setRotation(degrees(p.rotate));
  }
  return doc.save();
}

async function pageSizes(bytes: Uint8Array): Promise<{ w: number; h: number }[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { w: width, h: height };
  });
}

describe("normalizePdfToA4", () => {
  it("全ページA4縦なら変換しない（null）", async () => {
    const bytes = await makePdf([
      { w: A4W, h: A4H },
      { w: A4W, h: A4H },
    ]);
    expect(await normalizePdfToA4(bytes)).toBeNull();
  });

  it("A4横（扶養控除等申告書などの横の様式）はそのまま（null）", async () => {
    // 以前はA4横も「要変換」と判定され、A4縦へ縮小されて小さくなっていた
    const bytes = await makePdf([
      { w: A4H, h: A4W },
      { w: A4H, h: A4W },
    ]);
    expect(await normalizePdfToA4(bytes)).toBeNull();
  });

  it("大きさがバラバラのときは、縦長はA4縦・横長はA4横にそろえる", async () => {
    const bytes = await makePdf([
      { w: 400, h: 700 }, // 縦長のスキャン
      { w: 900, h: 500 }, // 横長のスキャン
    ]);
    const out = await normalizePdfToA4(bytes);
    expect(out).not.toBeNull();
    const sizes = await pageSizes(out!);
    expect(sizes[0].w).toBeCloseTo(A4W, 0);
    expect(sizes[0].h).toBeCloseTo(A4H, 0);
    // 横長のページはA4横のまま（縦に押し込まない）
    expect(sizes[1].w).toBeCloseTo(A4H, 0);
    expect(sizes[1].h).toBeCloseTo(A4W, 0);
  });

  it("回転指定のあるページは回転後の見た目の向きでそろえる", async () => {
    // A4縦のページに90度回転 → 見た目は横長なのでA4横に置く
    const bytes = await makePdf([{ w: A4W, h: A4H, rotate: 90 }]);
    const out = await normalizePdfToA4(bytes);
    expect(out).not.toBeNull();
    const sizes = await pageSizes(out!);
    expect(sizes[0].w).toBeCloseTo(A4H, 0);
    expect(sizes[0].h).toBeCloseTo(A4W, 0);
  });

  it("PDFとして読めないものは原本のまま（null）", async () => {
    expect(await normalizePdfToA4(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
