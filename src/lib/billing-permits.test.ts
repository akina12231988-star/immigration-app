import { describe, expect, it } from "vitest";
import { effectivePermitForMonth } from "./billing-permits";
import type { GrantedPermit } from "./supabase/queries/applications";

const permit = (over: Partial<GrantedPermit> & { permitDate: string }): GrantedPermit => ({
  workerId: "W",
  visa: "特定技能1号",
  content: "在留期間の更新許可",
  ...over,
});

describe("対象月の時点で有効だった在留許可", () => {
  it("その月までに下りている許可のうち一番新しいものを使う", () => {
    const permits = [
      permit({ permitDate: "2024-08-10" }),
      permit({ permitDate: "2025-08-10" }),
      permit({ permitDate: "2026-08-05" }),
    ];
    // 2026年7月分では、2026-08-05の更新許可はまだ下りていない
    expect(effectivePermitForMonth(permits, "2026-07")).toEqual({
      permitDate: "2025-08-10",
      visa: "特定技能1号",
    });
    // 8月分になれば新しい許可を使う
    expect(effectivePermitForMonth(permits, "2026-08")).toEqual({
      permitDate: "2026-08-05",
      visa: "特定技能1号",
    });
  });

  it("過去の許可が記録に無くても、あとの更新許可からその月の在籍が分かる", () => {
    // 前の許可が申請として登録されていないケース。
    // 8月に更新許可＝7月にはすでに同じ在留資格でいた
    const permits = [permit({ permitDate: "2026-08-05", content: "在留期間の更新許可" })];
    expect(effectivePermitForMonth(permits, "2026-07")).toEqual({
      permitDate: "2026-07-01",
      visa: "特定技能1号",
    });
  });

  it("あとの許可が変更許可なら、その月はまだ移行していないので対象にしない", () => {
    const permits = [
      permit({
        permitDate: "2026-08-05",
        content: "在留資格の変更許可",
        visa: "特定技能1号",
      }),
    ];
    expect(effectivePermitForMonth(permits, "2026-07")).toBeNull();
  });

  it("許可の記録がなければ null（現在の値をそのまま使う）", () => {
    expect(effectivePermitForMonth([], "2026-07")).toBeNull();
  });

  it("月末が31日でない月でも月末までで判定する", () => {
    const permits = [permit({ permitDate: "2026-02-28" })];
    expect(effectivePermitForMonth(permits, "2026-02")?.permitDate).toBe("2026-02-28");
  });
});
