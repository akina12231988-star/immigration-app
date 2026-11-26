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

describe("mergePdfParts（写せない PDF は画像にしてまとめる）", () => {
  // 1x1 の白い JPEG
  const JPG = Uint8Array.from(
    atob(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    ),
    (c) => c.charCodeAt(0),
  );
  it("壊れた PDF は rasterize で画像にして入れる", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4 broken");
    let called = 0;
    const bytes = await mergePdfParts([{ kind: "pdf", bytes: broken, name: "scan.pdf" }], {
      rasterize: async () => {
        called += 1;
        return [{ jpg: JPG, width: 595, height: 842 }];
      },
    });
    expect(called).toBe(1);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it("rasterize が無ければ、どのファイルか分かるエラーにする", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4 broken");
    await expect(mergePdfParts([{ kind: "pdf", bytes: broken, name: "scan.pdf" }])).rejects.toThrow("scan.pdf");
  });
});

describe("入力欄（フォーム）に文字が入っている PDF をまとめる", () => {
  it("入力した文字をページに焼き付けてから写す（入力欄のままだと空欄になることがある）", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { PDFDocument, PDFName } = await import("pdf-lib");
    const { fillFuyoForm } = await import("./fuyo-form");
    const { mergePdfParts } = await import("./pdf-merge");
    const pub = (p: string) => readFile(path.join(process.cwd(), "public", p));
    const font = await pub("fonts/NotoSansJP-Regular.ttf");
    const filled = await fillFuyoForm(
      await pub("forms/fuyo-r8.pdf"),
      font,
      {
        worker: { name: "BOY SAMNANG", kana: "ボイ", birth: "1999-01-01", address: "熊本県八代市", myNumber: "", hasSpouse: "無" },
        householdHead: "BOY",
        headRelation: "本人",
        dependents: [],
      },
      "2026-11-01",
      { flatten: false },
    );
    // 入力欄の見た目（文字）が無く、ビューアが開くときに描く PDF にする（本人が入力したものによくある形）
    const d = await PDFDocument.load(filled);
    for (const f of d.getForm().getFields()) for (const w of f.acroField.getWidgets()) w.dict.delete(PDFName.of("AP"));
    const bytes = await d.save({ updateFieldAppearances: false });
    const merged = await mergePdfParts([{ kind: "pdf", bytes }], { formFont: async () => font });
    const out = await PDFDocument.load(merged);
    expect(out.getPageCount()).toBe(d.getPageCount());
    // 入力欄（ウィジェット）は残らず、文字はページの中身に書き込まれている
    const widgets = (out.getPage(0).node.Annots()?.asArray() ?? []).filter((r) => {
      const a = out.context.lookup(r) as { get?: (n: unknown) => unknown } | undefined;
      return String(a?.get?.(PDFName.of("Subtype"))) === "/Widget";
    });
    expect(widgets).toHaveLength(0);
  }, 60000);
});
