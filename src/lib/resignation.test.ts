import { describe, expect, it } from "vitest";
import { FORM_312, FORM_34, FORM_511, formsForKind, jpDate } from "./resignation";

describe("formsForKind", () => {
  it("会社都合は3様式を作成する", () => {
    expect(formsForKind("会社都合")).toEqual([FORM_312, FORM_34, FORM_511]);
  });
  it("自己都合は3-1-2号のみ", () => {
    expect(formsForKind("自己都合")).toEqual([FORM_312]);
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
