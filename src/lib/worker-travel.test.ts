import { describe, expect, test } from "vitest";
import {
  formatStayDays,
  isStayingInJapan,
  japanStayDays,
  sortTravels,
  travelSummary,
} from "@/lib/worker-travel";

const trip = (over: Record<string, string | null>) => ({
  home_departure_on: null,
  japan_entry_on: null,
  japan_exit_on: null,
  home_entry_on: null,
  note: "",
  ...over,
});

describe("sortTravels", () => {
  test("入っているいちばん早い日付で古い順に並ぶ（日付なしは末尾）", () => {
    const a = trip({ japan_entry_on: "2023-08-10" });
    const b = trip({ home_departure_on: "2019-04-01", japan_entry_on: "2019-04-02" });
    const c = trip({});
    expect(sortTravels([a, c, b])).toEqual([b, a, c]);
  });
});

describe("japanStayDays / formatStayDays", () => {
  test("日本出国日まで（無ければ今日まで）の日数を数える", () => {
    expect(
      japanStayDays(trip({ japan_entry_on: "2026-08-01", japan_exit_on: "2026-08-11" }), "2026-08-22"),
    ).toBe(10);
    expect(japanStayDays(trip({ japan_entry_on: "2026-08-01" }), "2026-08-22")).toBe(21);
    expect(japanStayDays(trip({}), "2026-08-22")).toBeNull();
    // 日付が逆なら数えない
    expect(
      japanStayDays(trip({ japan_entry_on: "2026-08-10", japan_exit_on: "2026-08-01" }), "2026-08-22"),
    ).toBeNull();
  });

  test("日数の読みやすい表示", () => {
    expect(formatStayDays(10)).toBe("10日");
    expect(formatStayDays(90)).toBe("約3か月");
    expect(formatStayDays(400)).toBe("約1年1か月");
    expect(formatStayDays(365)).toBe("約1年");
  });
});

describe("travelSummary", () => {
  test("日本入国の回数と、いま日本にいる扱いかを返す", () => {
    const first = trip({
      home_departure_on: "2019-04-01",
      japan_entry_on: "2019-04-02",
      japan_exit_on: "2023-05-01",
      home_entry_on: "2023-05-02",
    });
    const second = trip({ home_departure_on: "2023-08-09", japan_entry_on: "2023-08-10" });
    expect(travelSummary([second, first])).toEqual({ entries: 2, inJapan: true });
    expect(travelSummary([first])).toEqual({ entries: 1, inJapan: false });
    expect(travelSummary([])).toEqual({ entries: 0, inJapan: false });
  });

  test("isStayingInJapan は日本入国済みで日本出国が空のとき", () => {
    expect(isStayingInJapan(trip({ japan_entry_on: "2026-01-01" }))).toBe(true);
    expect(
      isStayingInJapan(trip({ japan_entry_on: "2026-01-01", japan_exit_on: "2026-02-01" })),
    ).toBe(false);
  });
});
