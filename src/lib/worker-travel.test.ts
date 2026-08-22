import { describe, expect, test } from "vitest";
import {
  buildTrips,
  formatStayDays,
  isTripStayingInJapan,
  sortTravels,
  tripStayDays,
  tripsSummary,
} from "@/lib/worker-travel";

let seq = 0;
const row = (over: Record<string, string | null>) => ({
  id: `r${(seq += 1)}`,
  home_departure_on: null,
  japan_entry_on: null,
  japan_exit_on: null,
  home_entry_on: null,
  landing_permission: "",
  note: "",
  ...over,
});

describe("buildTrips", () => {
  test("スタンプ1個ずつ別の行で入れても、時系列で1往復ずつにまとまる", () => {
    // 実際にあった入れ方: 1スタンプ=1行（順不同）
    const rows = [
      row({ home_departure_on: "2018-08-22" }),
      row({ japan_entry_on: "2018-08-23", landing_permission: "技能実習1号ロ" }),
      row({ japan_exit_on: "2022-01-13" }),
      row({ home_departure_on: "2022-09-14" }),
      row({ japan_entry_on: "2022-09-15", landing_permission: "特定技能1号" }),
      row({ home_entry_on: "2023-05-06" }),
      row({ home_departure_on: "2023-05-14" }),
      row({ japan_entry_on: "2023-05-15" }),
    ];
    const trips = buildTrips(rows);
    expect(trips).toHaveLength(3);
    // 1回目: 母国出国〜日本出国（母国入国のスタンプなし）
    expect(trips[0]).toMatchObject({
      home_departure_on: "2018-08-22",
      japan_entry_on: "2018-08-23",
      japan_exit_on: "2022-01-13",
      home_entry_on: null,
      landing_permission: "技能実習1号ロ",
    });
    // 2回目: 日本出国のスタンプは無いが母国入国で区切れる
    expect(trips[1]).toMatchObject({
      home_departure_on: "2022-09-14",
      japan_entry_on: "2022-09-15",
      home_entry_on: "2023-05-06",
      landing_permission: "特定技能1号",
    });
    // 3回目: 滞在中
    expect(trips[2]).toMatchObject({
      home_departure_on: "2023-05-14",
      japan_entry_on: "2023-05-15",
      japan_exit_on: null,
      home_entry_on: null,
    });
    // 各往復に元の記録のidが入る（削除に使う）
    expect(trips[0].sourceIds).toHaveLength(3);
  });

  test("母国のスタンプが無ければ日本入国〜日本出国で1回と数える", () => {
    const trips = buildTrips([
      row({ japan_entry_on: "2020-01-10" }),
      row({ japan_exit_on: "2020-03-01" }),
      row({ japan_entry_on: "2020-06-01" }),
    ]);
    expect(trips).toHaveLength(2);
    expect(trips[0]).toMatchObject({ japan_entry_on: "2020-01-10", japan_exit_on: "2020-03-01" });
    expect(trips[1]).toMatchObject({ japan_entry_on: "2020-06-01" });
  });

  test("同じ日の日本出国と母国入国は同じ往復に入る", () => {
    const trips = buildTrips([
      row({ japan_exit_on: "2024-05-30" }),
      row({ home_entry_on: "2024-05-30" }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      japan_exit_on: "2024-05-30",
      home_entry_on: "2024-05-30",
    });
  });

  test("1行に1往復まとめて入れた記録もそのまま1回になる", () => {
    const trips = buildTrips([
      row({
        home_departure_on: "2019-04-01",
        japan_entry_on: "2019-04-02",
        japan_exit_on: "2023-05-01",
        home_entry_on: "2023-05-02",
      }),
    ]);
    expect(trips).toHaveLength(1);
  });
});

describe("tripStayDays / isTripStayingInJapan", () => {
  test("終わりは日本出国日→母国入国日→（最新の往復なら）今日の順で使う", () => {
    const t = (over: Record<string, string | null>) => ({
      japan_entry_on: "2026-08-01",
      japan_exit_on: null,
      home_entry_on: null,
      ...over,
    });
    expect(tripStayDays(t({ japan_exit_on: "2026-08-11" }), "2026-08-22", true)).toBe(10);
    expect(tripStayDays(t({ home_entry_on: "2026-08-13" }), "2026-08-22", true)).toBe(12);
    expect(tripStayDays(t({}), "2026-08-22", true)).toBe(21);
    // 古い往復で出国のスタンプが無いだけのときは数えない
    expect(tripStayDays(t({}), "2026-08-22", false)).toBeNull();
  });

  test("滞在中の判定は入国済みで出国も母国入国も無いとき", () => {
    expect(
      isTripStayingInJapan({ japan_entry_on: "2026-01-01", japan_exit_on: null, home_entry_on: null }),
    ).toBe(true);
    expect(
      isTripStayingInJapan({
        japan_entry_on: "2026-01-01",
        japan_exit_on: null,
        home_entry_on: "2026-02-01",
      }),
    ).toBe(false);
  });
});

describe("tripsSummary", () => {
  test("日本入国の回数と、最新の往復で滞在中かを返す", () => {
    const trips = buildTrips([
      row({ japan_entry_on: "2020-01-10", japan_exit_on: "2020-03-01" }),
      row({ japan_entry_on: "2020-06-01" }),
    ]);
    expect(tripsSummary(trips)).toEqual({ entries: 2, inJapan: true });
    expect(tripsSummary([])).toEqual({ entries: 0, inJapan: false });
  });
});

describe("formatStayDays / sortTravels", () => {
  test("日数の読みやすい表示", () => {
    expect(formatStayDays(10)).toBe("10日");
    expect(formatStayDays(90)).toBe("約3か月");
    expect(formatStayDays(400)).toBe("約1年1か月");
    expect(formatStayDays(365)).toBe("約1年");
  });

  test("行はいちばん早い日付で古い順（日付なしは末尾）", () => {
    const a = row({ japan_entry_on: "2023-08-10" });
    const b = row({ home_departure_on: "2019-04-01" });
    const c = row({});
    expect(sortTravels([a, c, b])).toEqual([b, a, c]);
  });
});
