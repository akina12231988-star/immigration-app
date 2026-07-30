import { describe, expect, it } from "vitest";
import {
  dependentAge,
  dependentCategories,
  dependentCategoryLabels,
  isSpouseRelation,
  normalizeDependents,
  warekiDate,
} from "./dependents";

const TODAY = "2026-07-30";

describe("dependentAge", () => {
  it("誕生日を過ぎていれば満年齢そのまま", () => {
    expect(dependentAge("1999-12-12", TODAY)).toBe(26);
    expect(dependentAge("1977-05-05", TODAY)).toBe(49);
  });

  it("誕生日がまだ来ていなければ1歳引く", () => {
    expect(dependentAge("2005-06-01", TODAY)).toBe(21); // 6/1 は過ぎている
    expect(dependentAge("2005-08-01", TODAY)).toBe(20); // 8/1 はまだ
  });

  it("不正な日付は null", () => {
    expect(dependentAge("", TODAY)).toBeNull();
    expect(dependentAge("1999/12/12", TODAY)).toBeNull();
  });
});

describe("warekiDate", () => {
  it("平成・昭和・令和を正しく変換する", () => {
    expect(warekiDate("1999-12-12")).toBe("平成11年12月12日");
    expect(warekiDate("1977-05-05")).toBe("昭和52年5月5日");
    expect(warekiDate("2005-06-01")).toBe("平成17年6月1日");
    expect(warekiDate("2020-01-01")).toBe("令和2年1月1日");
  });

  it("元号の境目を正しく判定する", () => {
    expect(warekiDate("1989-01-07")).toBe("昭和64年1月7日");
    expect(warekiDate("1989-01-08")).toBe("平成元年1月8日");
    expect(warekiDate("2019-04-30")).toBe("平成31年4月30日");
    expect(warekiDate("2019-05-01")).toBe("令和元年5月1日");
  });

  it("null・空・不正は空文字", () => {
    expect(warekiDate(null)).toBe("");
    expect(warekiDate("")).toBe("");
    expect(warekiDate("平成11年")).toBe("");
  });
});

describe("dependentCategories", () => {
  it("配偶者は配偶者控除", () => {
    const c = dependentCategories({ relation: "配偶者", birth: "2000-01-01" }, TODAY);
    expect(c.spouse).toBe(true);
    expect(c.specific).toBe(false);
    expect(isSpouseRelation("妻")).toBe(true);
    expect(isSpouseRelation("父")).toBe(false);
  });

  it("70歳以上は老人扶養親族（16歳以上30歳未満又は70歳以上にも該当）", () => {
    const c = dependentCategories({ relation: "父", birth: "1950-01-01" }, TODAY); // 76歳
    expect(c.elderly).toBe(true);
    expect(c.youngOrElderly).toBe(true);
    expect(c.remittanceRequired).toBe(false);
  });

  it("19歳以上23歳未満は特定扶養親族・特定親族", () => {
    const c = dependentCategories({ relation: "妹", birth: "2005-06-01" }, TODAY); // 21歳
    expect(c.specific).toBe(true);
    expect(c.youngOrElderly).toBe(true); // 16歳以上30歳未満
    expect(c.under16).toBe(false);
  });

  it("30歳以上70歳未満は38万円以上の支払必要", () => {
    const c = dependentCategories({ relation: "母", birth: "1979-11-12" }, TODAY); // 46歳
    expect(c.remittanceRequired).toBe(true);
    expect(c.youngOrElderly).toBe(false);
    expect(c.elderly).toBe(false);
  });

  it("16歳未満は16歳未満の親族", () => {
    const c = dependentCategories({ relation: "子", birth: "2015-01-01" }, TODAY); // 11歳
    expect(c.under16).toBe(true);
    expect(c.youngOrElderly).toBe(false);
  });

  it("生年月日未入力は年齢区分なし", () => {
    const c = dependentCategories({ relation: "父", birth: "" }, TODAY);
    expect(c.elderly).toBe(false);
    expect(c.under16).toBe(false);
    expect(c.remittanceRequired).toBe(false);
  });
});

describe("dependentCategoryLabels", () => {
  it("該当区分のラベルを返す（証明書の例: 母46歳）", () => {
    expect(dependentCategoryLabels({ relation: "母", birth: "1979-11-12" }, TODAY)).toEqual([
      "38万円以上の支払必要",
    ]);
  });

  it("妹21歳は特定扶養親族と16〜30歳の両方", () => {
    expect(dependentCategoryLabels({ relation: "妹", birth: "2005-06-01" }, TODAY)).toEqual([
      "特定扶養親族・特定親族",
      "16歳以上30歳未満又は70歳以上",
    ]);
  });
});

describe("normalizeDependents", () => {
  it("欠けたキーを補完し、配列でなければ空配列", () => {
    expect(normalizeDependents([{ name: "PORY PHANNA" }])[0]).toEqual({
      name: "PORY PHANNA",
      kana: "",
      relation: "",
      birth: "",
      address: "",
      occupation: "",
      my_number: "",
      income: "",
    });
    expect(normalizeDependents(null)).toEqual([]);
    expect(normalizeDependents("x")).toEqual([]);
  });
});
