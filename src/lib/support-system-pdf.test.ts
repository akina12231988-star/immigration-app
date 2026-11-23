import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { addSupportSystemPages, wrapText } from "./support-system-pdf";

describe("支援業務を行う体制についての説明（PDF）", () => {
  it("1文字ずつ幅で折り返す", () => {
    const font = { widthOfTextAtSize: (t: string, s: number) => t.length * s };
    expect(wrapText("あいうえおかきく", font, 10, 30)).toEqual(["あいう", "えおか", "きく"]);
    expect(wrapText("あ\nい", font, 10, 30)).toEqual(["あ", "い"]);
  });

  it("名簿が多くても1ページに収める（支援担当者は2列）", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(await readFile(path.join(__dirname, "../../public/fonts/NotoSansJP-Regular.ttf")), { subset: false });
    addSupportSystemPages(doc, font, {
      note: "説明文",
      officeName: "登録支援機関",
      orgName: "有限会社 阿蘇ビッグファーム",
      managers: ["VUONG VAN THANH"],
      staff: ["山田 花子"],
    });
    expect(doc.getPageCount()).toBe(1);
    addSupportSystemPages(doc, font, {
      note: "説明文",
      officeName: "登録支援機関",
      orgName: "",
      managers: [],
      staff: Array.from({ length: 30 }, (_, i) => `担当者${i + 1}`),
    });
    expect(doc.getPageCount()).toBe(2); // 1人目の分と合わせて2ページ（30人でも1ページ）
  });
});
