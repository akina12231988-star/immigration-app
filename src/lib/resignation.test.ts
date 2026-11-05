import { describe, expect, it } from "vitest";
import { FORM_14, FORM_312, FORM_34, FORM_511, FORM_KOYO_3, formsForKind, jpDate } from "./resignation";

describe("formsForKind", () => {
  it("会社都合は3様式＋本人の契約機関に関する届出を作成する", () => {
    expect(formsForKind("会社都合")).toEqual([FORM_312, FORM_34, FORM_511, FORM_14]);
  });
  it("自己都合は3-1-2号＋本人の契約機関に関する届出", () => {
    expect(formsForKind("自己都合")).toEqual([FORM_312, FORM_14]);
  });
  it("雇用保険の適用事業所でない所属機関は外国人雇用状況届出書も作る", () => {
    expect(formsForKind("自己都合", true)).toEqual([FORM_312, FORM_14, FORM_KOYO_3]);
    expect(formsForKind("会社都合", true)).toEqual([FORM_312, FORM_34, FORM_511, FORM_14, FORM_KOYO_3]);
  });
});

describe("jpDate", () => {
  it("YYYY-MM-DD を和文表記にする", () => {
    expect(jpDate("2026-07-22")).toBe("2026年7月22日");
  });
  it("空は空文字", () => {
    expect(jpDate(null)).toBe("");
    expect(jpDate("")).toBe("");
  });
});
