import { describe, expect, it } from "vitest";
import { covidPeriodAlert, isWithinCovidPeriod } from "./covid-period";

describe("コロナの帰国困難の期間", () => {
  it("2020年3月〜2023年3月に収まっていれば案内なし", () => {
    expect(isWithinCovidPeriod("2020-06-01", "2021-02-28", "2026-09-18")).toBe(true);
    expect(covidPeriodAlert("2020-06-01", "2021-02-28", "2026-09-18")).toBe("");
  });
  it("外れていれば案内を出す（開始が早い・終了が遅い・継続中）", () => {
    expect(covidPeriodAlert("2019-12-01", "2020-06-01", "2026-09-18")).toContain("コロナか確認してください");
    expect(covidPeriodAlert("2022-01-01", "2023-06-01", "2026-09-18")).toContain("コロナ発生期間");
    expect(isWithinCovidPeriod("2022-01-01", null, "2026-09-18")).toBe(false);
  });
  it("開始日が未入力なら判定しない", () => {
    expect(covidPeriodAlert("", null, "2026-09-18")).toBe("");
  });
});
