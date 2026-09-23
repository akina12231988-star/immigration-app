import { describe, expect, it } from "vitest";
import {
  annualHolidays,
  dailyWorkMinutes,
  dailyWorkText,
  followWorkSite,
  timeToMinutes,
  workplaceChangeText,
  workplaceText,
} from "./job-conditions";

describe("1日の所定労働時間", () => {
  it("終業 − 始業 − 休憩", () => {
    expect(timeToMinutes("8:00")).toBe(480);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(dailyWorkMinutes("08:00", "17:00", "60")).toBe(480);
    expect(dailyWorkText("08:00", "17:00", "60")).toBe("8時間");
    expect(dailyWorkText("08:30", "17:00", "60")).toBe("7時間30分");
  });
  it("日をまたぐ勤務・入力不足", () => {
    expect(dailyWorkText("22:00", "07:00", "60")).toBe("8時間");
    expect(dailyWorkText("", "17:00", "60")).toBe("");
    expect(dailyWorkMinutes("08:00", "09:00", "90")).toBeNull();
  });
});

describe("年間合計休日日数", () => {
  it("365 − 年間所定労働日数", () => {
    expect(annualHolidays("260")).toBe(105);
    expect(annualHolidays("260日")).toBe(105);
    expect(annualHolidays("")).toBeNull();
    expect(annualHolidays("400")).toBeNull();
  });
});

describe("就業の場所・交代制の表記", () => {
  it("変更の可能性", () => {
    expect(workplaceChangeText("無", [])).toBe("変更なし");
    expect(workplaceChangeText("", [])).toBe("");
    expect(
      workplaceChangeText("有", [{ name: "愛野営業所", address: "長崎県雲仙市愛野町", contact: "0957-00-0000" }]),
    ).toBe("変更あり: 愛野営業所（長崎県雲仙市愛野町／0957-00-0000）");
    expect(workplaceText({ name: "", address: "", contact: "" })).toBe("");
  });
});

describe("作業する住所 → 就業の場所の自動転記", () => {
  const prev = { address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" };
  it("空か前の値のままなら追いかける（事業所名は会社名）", () => {
    expect(followWorkSite([{ name: "", address: "", contact: "" }], { address: "", contact: "" }, prev, "株式会社A")).toEqual([
      { name: "株式会社A", address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" },
    ]);
    const rows = [{ name: "本社", address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" }, { name: "営業所", address: "X", contact: "" }];
    expect(followWorkSite(rows, prev, { ...prev, address: "長崎県雲仙市2" }, "株式会社A")).toEqual([
      { name: "本社", address: "長崎県雲仙市2", contact: "TEL 0957-00-0000" },
      { name: "営業所", address: "X", contact: "" },
    ]);
  });
  it("手で書き換えた1行目は上書きしない", () => {
    const rows = [{ name: "工場", address: "熊本県八代市", contact: "" }];
    expect(followWorkSite(rows, prev, { ...prev, address: "長崎県雲仙市2" }, "株式会社A")[0].address).toBe("熊本県八代市");
  });
});
