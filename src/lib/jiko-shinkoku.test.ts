import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import {
  buildJikoShinkokuPdf,
  fitFontSize,
  jikoShinkokuDateParts,
  jikoShinkokuFileName,
} from "./jiko-shinkoku";

const FORM = path.join(process.cwd(), "public", "forms", "jiko-shinkoku.pdf");
const FONT = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

describe("jikoShinkokuDateParts", () => {
  it("右上の年月日に入れる年・月・日に分ける（月日の先頭の0は落とす）", () => {
    expect(jikoShinkokuDateParts("2026-08-05")).toEqual({
      year: "2026",
      month: "8",
      day: "5",
    });
  });

  it("日付として読めないときは空欄のままにする", () => {
    expect(jikoShinkokuDateParts("")).toEqual({ year: "", month: "", day: "" });
    expect(jikoShinkokuDateParts("2026/08/05")).toEqual({ year: "", month: "", day: "" });
  });
});

describe("fitFontSize", () => {
  it("枠に収まるまで小さくする（長い住所でもはみ出さない）", () => {
    // 1文字あたり size ぶんの幅がある想定の文字列
    const width = (chars: number) => (size: number) => chars * size;
    expect(fitFontSize(width(10), 110, 11)).toBe(11);
    expect(fitFontSize(width(20), 110, 11)).toBe(7.5); // これ以上は小さくしない（下限）
    expect(fitFontSize(width(12), 110, 11)).toBe(9);
  });
});

describe("jikoShinkokuFileName", () => {
  it("会社名と日付が分かるファイル名にする", () => {
    expect(jikoShinkokuFileName("株式会社ハレノヒファーム", "2026-08-25")).toBe(
      "自己申告書_株式会社ハレノヒファーム_2026-08-25.pdf",
    );
  });

  it("ファイル名に使えない文字は落とす", () => {
    expect(jikoShinkokuFileName("A/B:C", "2026-08-25")).toBe("自己申告書_ABC_2026-08-25.pdf");
  });
});

describe("buildJikoShinkokuPdf", () => {
  it("白紙の様式（様式例第7号）がアプリに入っている", () => {
    expect(existsSync(FORM)).toBe(true);
  });

  it("様式のページ数を変えずに作れる（チェック欄には何も書かない）", async () => {
    const [form, font] = await Promise.all([readFile(FORM), readFile(FONT)]);
    const before = await PDFDocument.load(form);
    const bytes = await buildJikoShinkokuPdf(form, font, {
      orgName: "株式会社ハレノヒファーム",
      orgAddress: "熊本県八代市鏡町貝洲1272番地1",
      repName: "代表取締役 岩下　みちる",
      dateOn: "2026-08-25",
    });
    const after = await PDFDocument.load(bytes);
    expect(after.getPageCount()).toBe(before.getPageCount());
    const page = after.getPages()[0];
    // A4縦のまま
    expect(Math.round(page.getWidth())).toBe(595);
    expect(Math.round(page.getHeight())).toBe(842);
  }, 30_000);
});
