import { describe, expect, it } from "vitest";
import { orientationBaseDate, orientationDate } from "./orientation";

describe("orientationDate", () => {
  it("雇用開始日から2週間後の次の日曜を返す", () => {
    // 2026-07-01(水) +14 = 2026-07-15(水) → 次の日曜 2026-07-19
    expect(orientationDate("2026-07-01")).toBe("2026-07-19");
  });

  it("2週間後が日曜ならその日", () => {
    // 2026-07-05(日) +14 = 2026-07-19(日)
    expect(orientationDate("2026-07-05")).toBe("2026-07-19");
  });

  it("月をまたぐケース", () => {
    // 2026-07-20(月) +14 = 2026-08-03(月) → 次の日曜 2026-08-09
    expect(orientationDate("2026-07-20")).toBe("2026-08-09");
  });
});

describe("orientationBaseDate", () => {
  it("すでに雇用が始まっている資格変更（雇用開始日＜許可日）は在留許可日から数える", () => {
    expect(orientationBaseDate("2025-04-01", "2026-08-19")).toBe("2026-08-19");
  });

  it("これから雇用が始まる場合（許可日≦雇用開始日）や許可日が無い場合は雇用開始日から数える", () => {
    expect(orientationBaseDate("2026-09-01", "2026-08-19")).toBe("2026-09-01");
    expect(orientationBaseDate("2026-09-01", null)).toBe("2026-09-01");
    expect(orientationBaseDate("2026-09-01", "")).toBe("2026-09-01");
    expect(orientationBaseDate("2026-09-01", "2026-09-01")).toBe("2026-09-01");
  });
});
