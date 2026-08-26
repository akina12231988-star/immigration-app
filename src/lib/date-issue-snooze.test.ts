import { describe, expect, it } from "vitest";
import { nextNoon, snoozeUntilLabel } from "@/lib/date-issue-snooze";

describe("nextNoon", () => {
  it("お昼より前なら今日の12:00", () => {
    const now = new Date(2026, 7, 26, 9, 30);
    expect(nextNoon(now)).toEqual(new Date(2026, 7, 26, 12, 0, 0, 0));
  });

  it("ちょうど12:00のときは翌日の12:00（すぐ出てしまわないように）", () => {
    const now = new Date(2026, 7, 26, 12, 0, 0, 0);
    expect(nextNoon(now)).toEqual(new Date(2026, 7, 27, 12, 0, 0, 0));
  });

  it("お昼を過ぎていれば翌日の12:00", () => {
    const now = new Date(2026, 7, 26, 15, 5);
    expect(nextNoon(now)).toEqual(new Date(2026, 7, 27, 12, 0, 0, 0));
  });

  it("月末の夕方なら翌月1日の12:00", () => {
    const now = new Date(2026, 7, 31, 20, 0);
    expect(nextNoon(now)).toEqual(new Date(2026, 8, 1, 12, 0, 0, 0));
  });

  it("元の日時を書き換えない", () => {
    const now = new Date(2026, 7, 26, 9, 30);
    nextNoon(now);
    expect(now).toEqual(new Date(2026, 7, 26, 9, 30));
  });
});

describe("snoozeUntilLabel", () => {
  it("同じ日なら「今日」", () => {
    const now = new Date(2026, 7, 26, 9, 30);
    expect(snoozeUntilLabel(nextNoon(now), now)).toBe("今日 12:00");
  });

  it("次の日なら「明日」", () => {
    const now = new Date(2026, 7, 26, 15, 0);
    expect(snoozeUntilLabel(nextNoon(now), now)).toBe("明日 12:00");
  });

  it("2日以上先なら月日で出す", () => {
    const now = new Date(2026, 7, 26, 9, 0);
    expect(snoozeUntilLabel(new Date(2026, 8, 1, 12, 0), now)).toBe("9月1日 12:00");
  });

  it("日付が変わる時間帯でも「今日・明日」を取り違えない", () => {
    const now = new Date(2026, 7, 26, 23, 50);
    expect(snoozeUntilLabel(nextNoon(now), now)).toBe("明日 12:00");
  });
});
