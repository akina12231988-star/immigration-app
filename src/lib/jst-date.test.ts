import { describe, expect, it } from "vitest";
import { jstDateStr, todayJst } from "./jst-date";

describe("jstDateStr（日本時間の日付）", () => {
  it("UTC では前日でも、日本時間の 0:00〜8:59 は当日の日付になる", () => {
    // 2026-10-23 23:30 UTC = 2026-10-24 8:30 JST
    expect(jstDateStr(new Date("2026-10-23T23:30:00Z"))).toBe("2026-10-24");
    // 2026-10-24 00:00 UTC = 2026-10-24 9:00 JST
    expect(jstDateStr(new Date("2026-10-24T00:00:00Z"))).toBe("2026-10-24");
    // 2026-10-24 14:59 UTC = 2026-10-24 23:59 JST
    expect(jstDateStr(new Date("2026-10-24T14:59:00Z"))).toBe("2026-10-24");
    // 2026-10-24 15:00 UTC = 2026-10-25 0:00 JST
    expect(jstDateStr(new Date("2026-10-24T15:00:00Z"))).toBe("2026-10-25");
  });
  it("todayJst は YYYY-MM-DD の形", () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
