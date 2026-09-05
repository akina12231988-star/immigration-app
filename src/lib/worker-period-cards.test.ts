import { describe, expect, it } from "vitest";
import {
  cardAsOf,
  EMPTY_PERIOD_CARD,
  grantAsOf,
  isPeriodCardEmpty,
  periodCardKey,
  periodCardValues,
  type GrantRecord,
} from "./worker-period-cards";

const period = { key: "2024-04-01-0", org: "BASE株式会社", start: "2024-04-01", end: "2026-08-09" };

// 在籍中に許可された内容（当時の最終版）
const grantAtThatTime = {
  residenceCardNo: "AB12345678CD",
  residenceStatus: "特定技能1号",
  residencePermitDate: "2024-03-20",
  residenceExpiryDate: "2026-03-20",
};

const app = (over: Partial<GrantRecord>): GrantRecord => ({
  granted_card_no: "",
  granted_permit_date: null,
  granted_expiry_date: null,
  visa_at_grant: "",
  approval_date: null,
  ...over,
});

describe("periodCardKey", () => {
  it("在籍期間の開始日と終了日をキーにする", () => {
    expect(periodCardKey(period)).toBe("2024-04-01_2026-08-09");
  });
});

describe("grantAsOf", () => {
  const apps = [
    app({
      granted_card_no: "AB12345678CD",
      granted_permit_date: "2024-03-20",
      granted_expiry_date: "2026-03-20",
      visa_at_grant: "特定技能1号",
    }),
    // 退職より後（転職先での更新）の許可は当時の内容ではない
    app({
      granted_card_no: "LJ25107561RG",
      granted_permit_date: "2026-08-10",
      granted_expiry_date: "2027-08-10",
      visa_at_grant: "特定技能1号",
    }),
  ];

  it("その日までに最後に許可された内容を返す", () => {
    expect(grantAsOf(apps, "2026-08-09")).toEqual(grantAtThatTime);
  });

  it("在留許可日が無いときは許可日で判定する", () => {
    const rows = [app({ granted_card_no: "CD1", approval_date: "2023-05-01" })];
    expect(grantAsOf(rows, "2026-08-09")?.residencePermitDate).toBe("2023-05-01");
  });

  it("その日までに許可が無ければ null（当時の内容は分からない）", () => {
    expect(grantAsOf(apps, "2024-01-01")).toBeNull();
    expect(grantAsOf([], "2026-08-09")).toBeNull();
  });
});

describe("cardAsOf", () => {
  // 記録は「書き換える前の内容」。2026-08-10 に今の内容へ書き換えている
  const history = [
    {
      residence_card_no: "AB12345678CD",
      residence_status: "特定技能1号",
      residence_permit_date: "2024-03-20",
      residence_expiry_date: "2026-03-20",
      recorded_at: "2026-03-01T09:00:00Z",
    },
    {
      residence_card_no: "EF98765432GH",
      residence_status: "特定技能1号",
      residence_permit_date: "2026-03-01",
      residence_expiry_date: "2026-09-01",
      recorded_at: "2026-08-10T09:00:00Z",
    },
  ];

  it("その日より後に書き換えられた記録のうち、いちばん早いものを使う", () => {
    expect(cardAsOf(history, "2026-08-09")?.residenceCardNo).toBe("EF98765432GH");
    expect(cardAsOf(history, "2026-02-01")?.residenceCardNo).toBe("AB12345678CD");
  });

  it("その日より後の書き換えが記録されていなければ null", () => {
    expect(cardAsOf(history, "2026-08-11")).toBeNull();
    expect(cardAsOf([], "2026-08-09")).toBeNull();
  });
});

describe("periodCardValues", () => {
  it("当時の入力が無ければ、当時の最終版の許可内容と在籍期間の日付で出す", () => {
    expect(periodCardValues(period, null, grantAtThatTime)).toEqual({
      orgName: "BASE株式会社",
      residenceCardNo: "AB12345678CD",
      residenceStatus: "特定技能1号",
      residencePermitDate: "2024-03-20",
      residenceExpiryDate: "2026-03-20",
      employmentStartOn: "2024-04-01",
      leavingOn: "2026-08-09",
    });
  });

  it("当時の許可も入力も無い項目は空欄にする（今の在留カードの内容は使わない）", () => {
    expect(periodCardValues(period, null, null)).toEqual({
      orgName: "BASE株式会社",
      residenceCardNo: "",
      residenceStatus: "",
      residencePermitDate: null,
      residenceExpiryDate: null,
      employmentStartOn: "2024-04-01",
      leavingOn: "2026-08-09",
    });
  });

  it("手で入れた内容があればそちらを使う（入っている項目だけ差し替わる）", () => {
    const saved = {
      ...EMPTY_PERIOD_CARD,
      residence_card_no: "XY99999999ZZ",
      residence_permit_date: "2024-03-15",
      residence_expiry_date: "2026-03-15",
    };
    expect(periodCardValues(period, saved, grantAtThatTime)).toEqual({
      orgName: "BASE株式会社",
      residenceCardNo: "XY99999999ZZ",
      // 在留資格は未入力なので当時の許可の内容のまま
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
    const v = periodCardValues(period, saved, grantAtThatTime);
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
