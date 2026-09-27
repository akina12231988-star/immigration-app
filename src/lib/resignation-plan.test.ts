import { describe, expect, it } from "vitest";
import {
  appendLeavingDateChange,
  isPlannedLeaving,
  leavingDateLabel,
  leavingTimingOf,
  normalizeLeavingDateChanges,
  unreportedLeavingChanges,
} from "./resignation-plan";

describe("退職日の決め方", () => {
  it("保存値が空・不明なら「日付で決まっている」", () => {
    expect(leavingTimingOf("")).toBe("日付で決まっている");
    expect(leavingTimingOf(undefined)).toBe("日付で決まっている");
    expect(leavingTimingOf("許可が降りてから退職")).toBe("許可が降りてから退職");
  });
});

describe("退職予定か", () => {
  const today = "2026-09-27";
  it("退職日が今日以降なら退職予定", () => {
    expect(isPlannedLeaving({ leaving_on: "2026-09-27" }, today)).toBe(true);
    expect(isPlannedLeaving({ leaving_on: "2026-10-15" }, today)).toBe(true);
    expect(isPlannedLeaving({ leaving_on: "2026-09-26" }, today)).toBe(false);
  });
  it("許可待ちで日付未定も退職予定。ただの未定は違う", () => {
    expect(isPlannedLeaving({ leaving_on: null, leaving_timing: "許可が降りてから退職" }, today)).toBe(true);
    expect(isPlannedLeaving({ leaving_on: null, leaving_timing: "" }, today)).toBe(false);
  });
});

describe("退職日の変更の記録", () => {
  it("変わったときだけ未報告で1件足す（未定→日付も残す）", () => {
    let changes = appendLeavingDateChange([], null, "2026-10-15", "2026-09-27");
    changes = appendLeavingDateChange(changes, "2026-10-15", "2026-10-15", "2026-09-28");
    changes = appendLeavingDateChange(changes, "2026-10-15", "2026-10-31", "2026-10-01");
    expect(changes.map((c) => [c.from, c.to, c.changed_on, c.reported, c.approval])).toEqual([
      [null, "2026-10-15", "2026-09-27", false, ""],
      ["2026-10-15", "2026-10-31", "2026-10-01", false, ""],
    ]);
    expect(unreportedLeavingChanges(changes)).toBe(2);
  });

  it("空文字と null は同じ（未定のまま）とみなす", () => {
    expect(appendLeavingDateChange([], "", null, "2026-09-27")).toEqual([]);
  });

  it("保存値を正規化する（未適用・壊れた値・知らない了承の値）", () => {
    expect(normalizeLeavingDateChanges(null)).toEqual([]);
    expect(
      normalizeLeavingDateChanges([
        { id: "c1", from: "", to: "2026-10-15", changed_on: "2026-09-27", reported: true, reported_on: "2026-09-28", approval: "了承済み" },
        { from: "2026-10-15", to: "2026-10-31", approval: "?" },
        "壊れた値",
      ]),
    ).toEqual([
      { id: "c1", from: null, to: "2026-10-15", changed_on: "2026-09-27", reported: true, reported_on: "2026-09-28", approval: "了承済み" },
      { id: "c1", from: "2026-10-15", to: "2026-10-31", changed_on: "", reported: false, reported_on: "", approval: "" },
    ]);
  });

  it("日付の表示", () => {
    expect(leavingDateLabel("2026-10-15")).toBe("2026/10/15");
    expect(leavingDateLabel(null)).toBe("未定");
  });
});
