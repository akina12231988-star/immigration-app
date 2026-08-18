import { describe, expect, it } from "vitest";
import {
  MINIMUM_WAGES,
  MINIMUM_WAGE_FISCAL_YEAR,
  PREFECTURES,
  checkMinimumWage,
  minimumWageUpdateDue,
  prefectureFromAddress,
} from "./minimum-wage";

describe("MINIMUM_WAGES", () => {
  it("47都道府県すべての額を持っている", () => {
    expect(PREFECTURES).toHaveLength(47);
  });
  it("令和7年度はすべて1,000円以上", () => {
    for (const [pref, entry] of Object.entries(MINIMUM_WAGES)) {
      expect(entry.hourly, pref).toBeGreaterThanOrEqual(1000);
    }
  });
  it("厚労省の一覧どおりの額になっている（抜き取り）", () => {
    expect(MINIMUM_WAGES["熊本県"].hourly).toBe(1034);
    expect(MINIMUM_WAGES["東京都"].hourly).toBe(1226);
    expect(MINIMUM_WAGES["香川県"].hourly).toBe(1036);
    expect(MINIMUM_WAGES["山形県"].hourly).toBe(1032);
    expect(MINIMUM_WAGES["岡山県"].hourly).toBe(1047);
    expect(MINIMUM_WAGES["三重県"].hourly).toBe(1087);
  });
  it("発効日を持っている", () => {
    for (const [pref, entry] of Object.entries(MINIMUM_WAGES)) {
      expect(entry.effectiveOn, pref).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("minimumWageUpdateDue", () => {
  it("次の改定時期（翌年10月1日）を過ぎたら更新をうながす", () => {
    expect(minimumWageUpdateDue(`${MINIMUM_WAGE_FISCAL_YEAR + 1}-09-30`)).toBe(false);
    expect(minimumWageUpdateDue(`${MINIMUM_WAGE_FISCAL_YEAR + 1}-10-01`)).toBe(true);
    expect(minimumWageUpdateDue(`${MINIMUM_WAGE_FISCAL_YEAR + 2}-01-01`)).toBe(true);
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
    expect(r.minimum).toBe(MINIMUM_WAGES["熊本県"].hourly);
    expect(r.diff).toBe(1100 - MINIMUM_WAGES["熊本県"].hourly);
  });
  it("下回っていたら不足額が分かる", () => {
    const min = MINIMUM_WAGES["熊本県"].hourly;
    const r = checkMinimumWage(min - 20, "熊本県")!;
    expect(r.ok).toBe(false);
    expect(r.diff).toBe(-20);
  });
  it("ちょうど同額はクリア", () => {
    expect(checkMinimumWage(MINIMUM_WAGES["東京都"].hourly, "東京都")!.ok).toBe(true);
  });
  it("時給や都道府県が分からないときは判定しない", () => {
    expect(checkMinimumWage(null, "熊本県")).toBeNull();
    expect(checkMinimumWage(1100, null)).toBeNull();
    expect(checkMinimumWage(1100, "海外")).toBeNull();
  });
});
