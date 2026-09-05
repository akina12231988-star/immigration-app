import { describe, expect, it } from "vitest";
import {
  EMPTY_PERIOD_CARD,
  isPeriodCardEmpty,
  periodCardKey,
  periodCardValues,
} from "./worker-period-cards";

const period = { key: "2024-04-01-0", org: "BASE株式会社", start: "2024-04-01", end: "2026-08-09" };
const current = {
  residenceCardNo: "LJ25107561RG",
  residenceStatus: "特定技能1号",
  residencePermitDate: "2026-08-10",
  residenceExpiryDate: "2027-08-10",
};

describe("periodCardKey", () => {
  it("在籍期間の開始日と終了日をキーにする", () => {
    expect(periodCardKey(period)).toBe("2024-04-01_2026-08-09");
  });
});

describe("periodCardValues", () => {
  it("当時の入力が無ければ、在籍期間の日付と今の在留カード情報で出す", () => {
    expect(periodCardValues(period, null, current)).toEqual({
      orgName: "BASE株式会社",
      residenceCardNo: "LJ25107561RG",
      residenceStatus: "特定技能1号",
      residencePermitDate: "2026-08-10",
      residenceExpiryDate: "2027-08-10",
      employmentStartOn: "2024-04-01",
      leavingOn: "2026-08-09",
    });
  });

  it("当時の入力があればそちらを使う（入っている項目だけ差し替わる）", () => {
    const saved = {
      ...EMPTY_PERIOD_CARD,
      residence_card_no: "AB12345678CD",
      residence_permit_date: "2024-03-15",
      residence_expiry_date: "2026-03-15",
    };
    expect(periodCardValues(period, saved, current)).toEqual({
      orgName: "BASE株式会社",
      residenceCardNo: "AB12345678CD",
      // 在留資格は未入力なので今の値のまま
      residenceStatus: "特定技能1号",
      residencePermitDate: "2024-03-15",
      residenceExpiryDate: "2026-03-15",
      employmentStartOn: "2024-04-01",
      leavingOn: "2026-08-09",
    });
  });

  it("雇用開始日・退職日を入れ直したときはその日付で出す", () => {
    const saved = {
      ...EMPTY_PERIOD_CARD,
      employment_start_on: "2024-05-01",
      leaving_on: "2026-07-31",
    };
    const v = periodCardValues(period, saved, current);
    expect([v.employmentStartOn, v.leavingOn]).toEqual(["2024-05-01", "2026-07-31"]);
  });
});

describe("isPeriodCardEmpty", () => {
  it("まだ何も入っていないかを判定する", () => {
    expect(isPeriodCardEmpty(null)).toBe(true);
    expect(isPeriodCardEmpty(EMPTY_PERIOD_CARD)).toBe(true);
    expect(isPeriodCardEmpty({ ...EMPTY_PERIOD_CARD, note: "メモだけ" })).toBe(true);
    expect(isPeriodCardEmpty({ ...EMPTY_PERIOD_CARD, residence_card_no: "AB1" })).toBe(false);
  });
});
