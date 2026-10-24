import { describe, expect, it } from "vitest";
import {
  appendLeavingDateChange,
  isPlannedLeaving,
  leavingDateLabel,
  leavingTimingOf,
  normalizeLeavingDateChanges,
  resignationTodoSummary,
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

describe("外国人詳細の TODO 欄に出す退職の記録のひとこと", () => {
  const TODAY = "2026-10-24";

  it("許可が降りてから退職（日付未定・特定活動・届出不要）", () => {
    const s = resignationTodoSummary(
      {
        kind: "自己都合",
        leaving_on: null,
        leaving_timing: "許可が降りてから退職",
        leaving_plan_note: "現在の審査結果が降り次第、退職予定",
        residence_status: "特定活動（特定技能1号移行準備）",
        report_needed: false,
      },
      "準備中",
      TODAY,
    );
    expect(s.title).toBe("退職予定（許可が降りてから退職・退職日 未定）");
    expect(s.badge).toBe("届出不要");
    expect(s.detail).toBe("自己都合 ・ 在留資格 特定活動（特定技能1号移行準備） ・ 退職予定のメモ: 現在の審査結果が降り次第、退職予定");
    expect(s.planned).toBe(true);
  });

  it("退職日が決まっていてまだ先なら退職予定、過ぎていれば退職。随時報告書を作る記録は進み具合を出す", () => {
    const base = { kind: "会社都合", leaving_on: "2026-11-30", residence_status: "特定技能1号", todo_no: "TODO-1" };
    const future = resignationTodoSummary(base, "署名依頼中", TODAY);
    expect(future.title).toBe("退職予定（2026/11/30に退職）");
    expect(future.badge).toBe("随時報告書 署名依頼中");
    expect(future.detail).toBe("会社都合 ・ 在留資格 特定技能1号 ・ 随時報告TODO TODO-1");
    const past = resignationTodoSummary({ ...base, leaving_on: "2026-09-30" }, "投函完了", TODAY);
    expect(past.title).toBe("退職 2026/09/30");
    expect(past.planned).toBe(false);
  });
});
