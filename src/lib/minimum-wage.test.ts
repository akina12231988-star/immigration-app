import { describe, expect, it } from "vitest";
import {
  MINIMUM_WAGES,
  PREFECTURES,
  checkMinimumWage,
  prefectureFromAddress,
} from "./minimum-wage";

describe("MINIMUM_WAGES", () => {
  it("47都道府県すべての額を持っている", () => {
    expect(PREFECTURES).toHaveLength(47);
  });
  it("令和7年度はすべて1,000円以上", () => {
    for (const [pref, wage] of Object.entries(MINIMUM_WAGES)) {
      expect(wage, pref).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("prefectureFromAddress", () => {
  it("住所の先頭の都道府県を読み取る", () => {
    expect(prefectureFromAddress("熊本県八代市新浜町1番1号")).toBe("熊本県");
    expect(prefectureFromAddress("東京都新宿区…")).toBe("東京都");
    expect(prefectureFromAddress("北海道札幌市…")).toBe("北海道");
  });
  it("途中に都道府県があっても読み取る", () => {
    expect(prefectureFromAddress("〒866-0000 熊本県八代市…")).toBe("熊本県");
  });
  it("分からないときは null", () => {
    expect(prefectureFromAddress("")).toBeNull();
    expect(prefectureFromAddress("八代市新浜町1番1号")).toBeNull();
  });
});

describe("checkMinimumWage", () => {
  it("最低賃金以上ならクリア", () => {
    const r = checkMinimumWage(1100, "熊本県")!;
    expect(r.ok).toBe(true);
    expect(r.minimum).toBe(MINIMUM_WAGES["熊本県"]);
    expect(r.diff).toBe(1100 - MINIMUM_WAGES["熊本県"]);
  });
  it("下回っていたら不足額が分かる", () => {
    const min = MINIMUM_WAGES["熊本県"];
    const r = checkMinimumWage(min - 20, "熊本県")!;
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(-20);
  });
  it("ちょうど同額はクリア", () => {
    expect(checkMinimumWage(MINIMUM_WAGES["東京都"], "東京都")!.ok).toBe(true);
  });
  it("時給や都道府県が分からないときは判定しない", () => {
    expect(checkMinimumWage(null, "熊本県")).toBeNull();
    expect(checkMinimumWage(1100, null)).toBeNull();
    expect(checkMinimumWage(1100, "海外")).toBeNull();
  });
});
