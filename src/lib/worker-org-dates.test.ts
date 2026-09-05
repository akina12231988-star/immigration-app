import { describe, expect, it } from "vitest";
import { orgEmploymentDates, type OrgHistoryRow } from "./worker-org-dates";

const history = (over: Partial<OrgHistoryRow>): OrgHistoryRow => ({
  org_name: "有限会社國崎青果",
  start_date: "2026-08-12",
  end_date: null,
  visa: "特定技能1号",
  ...over,
});

const histories = [
  history({ org_name: "西田　博幸", start_date: "2026-08-12", end_date: null }),
  history({ org_name: "有限会社國崎青果", start_date: "2024-04-01", end_date: "2026-08-09" }),
];

describe("orgEmploymentDates", () => {
  it("在籍中の会社では退職日を出さない（前の会社の退職日を出さない）", () => {
    expect(
      orgEmploymentDates({
        orgName: "西田　博幸",
        histories,
        orgStartOn: null,
        employmentStartOn: "2026-08-12",
        leavingOn: "2026-08-09", // 前の会社の退職日が残っている
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2026-08-12", leavingOn: null });
  });

  it("辞めた会社では、その会社の在籍期間の日付を出す", () => {
    expect(
      orgEmploymentDates({
        orgName: "有限会社國崎青果",
        histories,
        orgStartOn: null,
        employmentStartOn: "2026-08-12",
        leavingOn: "2026-08-09",
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2024-04-01", leavingOn: "2026-08-09" });
  });

  it("所属機関別の雇用開始日があればそれを使う", () => {
    expect(
      orgEmploymentDates({
        orgName: "西田　博幸",
        histories,
        orgStartOn: "2026-08-20",
        employmentStartOn: "2026-08-12",
        leavingOn: null,
        hasCurrentOrg: true,
      }).employmentStartOn,
    ).toBe("2026-08-20");
  });

  it("職歴が無くても、今どこかに所属していれば退職日は出さない", () => {
    expect(
      orgEmploymentDates({
        orgName: "まだ職歴を入れていない会社",
        histories,
        orgStartOn: null,
        employmentStartOn: "2026-08-12",
        leavingOn: "2026-08-09",
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2026-08-12", leavingOn: null });
  });

  it("どこにも所属していない人は、これまでどおり退職日を出す", () => {
    expect(
      orgEmploymentDates({
        orgName: "",
        histories,
        orgStartOn: null,
        employmentStartOn: "2024-04-01",
        leavingOn: "2026-08-09",
        hasCurrentOrg: false,
      }),
    ).toEqual({ employmentStartOn: "2024-04-01", leavingOn: "2026-08-09" });
  });

  it("機関名の全角・半角や法人格の書き方が違っても同じ会社として扱う", () => {
    const rows = [history({ org_name: "ＢＡＳＥ株式会社", start_date: "2023-01-05", end_date: "2024-03-31" })];
    expect(
      orgEmploymentDates({
        orgName: "BASE株式会社",
        histories: rows,
        orgStartOn: null,
        employmentStartOn: null,
        leavingOn: null,
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2023-01-05", leavingOn: "2024-03-31" });
  });
});
