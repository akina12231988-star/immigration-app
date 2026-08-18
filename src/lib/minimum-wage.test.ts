import { describe, expect, it } from "vitest";
import {
  MINIMUM_WAGES,
  MINIMUM_WAGE_FISCAL_YEAR,
  MINIMUM_WAGE_HISTORY,
  PREFECTURES,
  checkMinimumWage,
  minimumWageAt,
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
  it("47都道府県すべてに令和5〜7年度の3年分がある（古い順）", () => {
    for (const [pref, list] of Object.entries(MINIMUM_WAGE_HISTORY)) {
      expect(list.length, pref).toBe(3);
      expect(list[0].effectiveOn < list[1].effectiveOn, pref).toBe(true);
      expect(list[1].effectiveOn < list[2].effectiveOn, pref).toBe(true);
      expect(list[0].hourly < list[1].hourly, pref).toBe(true);
      expect(list[1].hourly < list[2].hourly, pref).toBe(true);
    }
  });
});

describe("minimumWageAt", () => {
  it("その日に適用されていた額を返す（熊本県）", () => {
    // 令和6年度は2024-10-05から952円、令和7年度は2026-01-01から1,034円
    expect(minimumWageAt("熊本県", "2024-08-16")!.hourly).toBe(898); // 令和5年度
    expect(minimumWageAt("熊本県", "2024-10-05")!.hourly).toBe(952);
    expect(minimumWageAt("熊本県", "2025-12-31")!.hourly).toBe(952);
    expect(minimumWageAt("熊本県", "2026-01-01")!.hourly).toBe(1034);
  });
  it("表より前の日付は分からない", () => {
    expect(minimumWageAt("熊本県", "2023-01-01")).toBeNull();
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
  it("期間を渡すと、その間でいちばん高い最低賃金と比べる", () => {
    // 2024-08-16から2026-01-01まで据え置いた月給→時給974円は、
    // 当時（898円・952円）はクリアだが、2026-01-01の1,034円には届かない
    expect(checkMinimumWage(974, "熊本県", "2024-08-16", "2025-12-31")!.ok).toBe(true);
    expect(checkMinimumWage(974, "熊本県", "2024-08-16", "2025-12-31")!.minimum).toBe(952);
    expect(checkMinimumWage(974, "熊本県", "2024-08-16", "2026-06-01")!.ok).toBe(false);
    expect(checkMinimumWage(974, "熊本県", "2024-08-16", "2026-06-01")!.minimum).toBe(1034);
  });

  it("時給や都道府県が分からないときは判定しない", () => {
    expect(checkMinimumWage(null, "熊本県")).toBeNull();
    expect(checkMinimumWage(1100, null)).toBeNull();
    expect(checkMinimumWage(1100, "海外")).toBeNull();
  });
});
