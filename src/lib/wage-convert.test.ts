import { describe, expect, it } from "vitest";
import { hourlyFromMonthly, monthlyFromHourly, wageConversionText } from "./wage";

describe("hourlyFromMonthly", () => {
  it("月給×12ヶ月÷年間所定労働時間数で時給を出す", () => {
    // 月給187,000円・年間所定労働時間2,000時間 → 187,000×12÷2,000 = 1,122円
    expect(hourlyFromMonthly(187000, 2000)).toBe(1122);
    expect(hourlyFromMonthly(200000, 1920)).toBe(1250);
  });
  it("端数は四捨五入する", () => {
    expect(hourlyFromMonthly(180000, 1900)).toBe(1137); // 1136.84…
  });
  it("金額か年間所定労働時間が未登録なら換算しない", () => {
    expect(hourlyFromMonthly(187000, 0)).toBeNull();
    expect(hourlyFromMonthly(0, 2000)).toBeNull();
  });
});

describe("monthlyFromHourly", () => {
  it("時給×年間所定労働時間数÷12ヶ月で月給を出す", () => {
    expect(monthlyFromHourly(1122, 2000)).toBe(187000);
    expect(monthlyFromHourly(1000, 1920)).toBe(160000);
  });
  it("年間所定労働時間が未登録なら換算しない", () => {
    expect(monthlyFromHourly(1100, 0)).toBeNull();
  });
});

describe("wageConversionText", () => {
  it("月給には時給を、時給には月給を出す", () => {
    expect(wageConversionText("月給", 187000, 2000)).toBe("時給 約1,122円");
    expect(wageConversionText("時給", 1122, 2000)).toBe("月給 約187,000円");
  });
  it("日給・年収は換算しない", () => {
    expect(wageConversionText("日給", 10000, 2000)).toBeNull();
    expect(wageConversionText("年収", 3000000, 2000)).toBeNull();
  });
  it("年間所定労働時間が未登録なら出さない", () => {
    expect(wageConversionText("月給", 187000, 0)).toBeNull();
  });
});
