import { describe, expect, it } from "vitest";
import {
  emptyRosterFill,
  hasRosterFill,
  rosterFillPatch,
  wageAmountOf,
  wageStartedOnOf,
} from "./org-roster-fill";

const TODAY = "2026-08-21";

describe("emptyRosterFill", () => {
  it("賃金の区分は時給から始める（いちばん多い形）", () => {
    expect(emptyRosterFill()).toEqual({
      startOn: "",
      wageKind: "時給",
      wageAmount: "",
      wageStartedOn: "",
    });
  });
});

describe("rosterFillPatch", () => {
  it("片方だけ入れても、もう片方は残る", () => {
    const filled = rosterFillPatch(emptyRosterFill(), { startOn: "2026-04-01" });
    const both = rosterFillPatch(filled, { wageAmount: "1100" });
    expect(both.startOn).toBe("2026-04-01");
    expect(both.wageAmount).toBe("1100");
  });
});

describe("hasRosterFill", () => {
  it("何も入れていなければ保存しない", () => {
    expect(hasRosterFill(emptyRosterFill())).toBe(false);
  });

  it("雇用開始日だけでも保存する", () => {
    expect(hasRosterFill(rosterFillPatch(emptyRosterFill(), { startOn: "2026-04-01" }))).toBe(true);
  });

  it("賃金の金額だけでも保存する", () => {
    expect(hasRosterFill(rosterFillPatch(emptyRosterFill(), { wageAmount: "1100" }))).toBe(true);
  });

  it("区分を選んだだけ・0円では保存しない", () => {
    expect(hasRosterFill(rosterFillPatch(emptyRosterFill(), { wageKind: "月給" }))).toBe(false);
    expect(hasRosterFill(rosterFillPatch(emptyRosterFill(), { wageAmount: "0" }))).toBe(false);
    expect(hasRosterFill(rosterFillPatch(emptyRosterFill(), { wageAmount: "円" }))).toBe(false);
  });
});

describe("wageAmountOf", () => {
  it("カンマや円が付いていても金額として読む", () => {
    expect(wageAmountOf(rosterFillPatch(emptyRosterFill(), { wageAmount: "1,100円" }))).toBe(1100);
    expect(wageAmountOf(rosterFillPatch(emptyRosterFill(), { wageAmount: "180000" }))).toBe(180000);
  });
});

describe("wageStartedOnOf", () => {
  it("同じ行で入れた雇用開始日を既定にする", () => {
    const fill = rosterFillPatch(emptyRosterFill(), { startOn: "2026-04-01" });
    expect(wageStartedOnOf(fill, null, TODAY)).toBe("2026-04-01");
  });

  it("登録済みの雇用開始日があればそれを既定にする", () => {
    expect(wageStartedOnOf(emptyRosterFill(), "2024-10-25", TODAY)).toBe("2024-10-25");
  });

  it("どちらも無ければ今日にする", () => {
    expect(wageStartedOnOf(emptyRosterFill(), null, TODAY)).toBe(TODAY);
  });

  it("日付を触ったときは、その値を優先する", () => {
    const fill = rosterFillPatch(emptyRosterFill(), {
      startOn: "2026-04-01",
      wageStartedOn: "2026-07-01",
    });
    expect(wageStartedOnOf(fill, "2024-10-25", TODAY)).toBe("2026-07-01");
  });
});
