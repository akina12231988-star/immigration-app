import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildReasonLetterPdf,
  emptyReasonLetter,
  normalizeReasonLetterOptions,
  reasonLetterDocKey,
  reasonLetterFooterLines,
  reasonLetterFormKey,
  wrapReasonText,
} from "./reason-letter";

describe("理由書", () => {
  it("最初の内容・キー", () => {
    const l = emptyReasonLetter("2026-11-23");
    expect(l.title).toBe("理由書");
    expect(l.addressee).toBe("出入国在留管理庁長官 殿");
    expect(l.letterDate).toBe("令和8年11月23日");
    expect(reasonLetterDocKey("t1-9")).toBe("prep_reason_t1_9");
    expect(reasonLetterFormKey("s2-18")).toBe("t1-17"); // 2号の同じ書類は1号のキー
    expect(normalizeReasonLetterOptions({ name: false, x: 1 })).toEqual({ name: false, nationality: true, birth: true, sign: true, supportOrg: false });
  });
  it("最後に入れる項目は選んだものだけ", () => {
    const person = { name: "ENG VANDANY", nationality: "カンボジア", birth: "1987-09-10" };
    const all = reasonLetterFooterLines({ name: true, nationality: true, birth: true, sign: true, supportOrg: true }, person, "VUONG VAN THANH");
    expect(all).toEqual(["申請人", "氏名　ENG VANDANY", "国籍・地域　カンボジア", "生年月日　1987年9月10日", expect.stringMatching(/^署名/), "", "登録支援機関　VUONG VAN THANH"]);
    expect(reasonLetterFooterLines({ name: false, nationality: false, birth: false, sign: false, supportOrg: true }, person, "当社")).toEqual(["登録支援機関　当社"]);
    expect(reasonLetterFooterLines({ name: false, nationality: false, birth: false, sign: false, supportOrg: false }, person, "当社")).toEqual([]);
  });
  it("折り返し（改行はそのまま）", () => {
    expect(wrapReasonText("あいうえお\nか", 3, (t) => t.length)).toEqual(["あいう", "えお", "か"]);
  });
  it("PDF を作る（本文が長いとページが増える）", async () => {
    const font = readFileSync(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const l = { ...emptyReasonLetter("2026-11-23"), body: "理由。".repeat(10) };
    const one = await PDFDocument.load(await buildReasonLetterPdf(font, l, ["申請人", "氏名　A"]));
    expect(one.getPageCount()).toBe(1);
    const long = await PDFDocument.load(await buildReasonLetterPdf(font, { ...l, body: "長い理由。\n".repeat(60) }, ["申請人"]));
    expect(long.getPageCount()).toBeGreaterThan(1);
  }, 20000);
});
