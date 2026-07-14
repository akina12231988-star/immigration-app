import { describe, expect, it } from "vitest";
import { orientationDate } from "./orientation";

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
