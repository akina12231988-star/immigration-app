import { describe, expect, it } from "vitest";
import {
  historyToCloseOnLeaving,
  orgEmploymentDates,
  type OrgHistoryRow,
} from "./worker-org-dates";

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

  it("退職者情報の「退職した所属機関」がこの会社なら、職歴が無くても退職日を出す", () => {
    expect(
      orgEmploymentDates({
        orgName: "有限会社國崎青果",
        histories: [history({ org_name: "有限会社國崎青果", start_date: "2025-12-22", end_date: null })],
        orgStartOn: null,
        employmentStartOn: "2025-12-22",
        leavingOn: "2026-08-31",
        leavingOrgName: "有限会社國崎青果",
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2025-12-22", leavingOn: "2026-08-31" });
  });

  it("退職した所属機関が別の会社なら、その会社の個人票には退職日を出さない", () => {
    expect(
      orgEmploymentDates({
        orgName: "西田　博幸",
        histories,
        orgStartOn: null,
        employmentStartOn: "2026-08-12",
        leavingOn: "2026-08-09",
        leavingOrgName: "有限会社國崎青果",
        hasCurrentOrg: true,
      }).leavingOn,
    ).toBeNull();
  });

  it("退職した所属機関が空欄でも、退職・帰国した人の今の所属機関なら退職日を出す", () => {
    expect(
      orgEmploymentDates({
        orgName: "有限会社國崎青果",
        histories: [history({ org_name: "有限会社國崎青果", start_date: "2025-12-22", end_date: null })],
        orgStartOn: null,
        employmentStartOn: "2025-12-22",
        leavingOn: "2026-08-31",
        isCurrentOrg: true,
        workerLeft: true,
        hasCurrentOrg: true,
      }).leavingOn,
    ).toBe("2026-08-31");
  });

  it("在籍中の人は、今の所属機関でも退職日を出さない", () => {
    expect(
      orgEmploymentDates({
        orgName: "西田　博幸",
        histories,
        orgStartOn: null,
        employmentStartOn: "2026-08-12",
        leavingOn: "2026-08-09",
        isCurrentOrg: true,
        workerLeft: false,
        hasCurrentOrg: true,
      }).leavingOn,
    ).toBeNull();
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

describe("historyToCloseOnLeaving", () => {
  const rows = [
    { id: "h1", org_name: "有限会社國崎青果", start_date: "2025-12-22", end_date: null, visa: "特定技能1号" },
    { id: "h2", org_name: "ベトナムの会社", start_date: "2020-01-01", end_date: "2023-12-31", visa: "本国での職歴" },
  ];

  it("退職した所属機関の職歴を返す", () => {
    expect(
      historyToCloseOnLeaving(rows, { orgName: "有限会社國崎青果", leavingOn: "2026-08-31" })?.id,
    ).toBe("h1");
  });

  it("退職した所属機関が空欄なら、続いている職歴を返す", () => {
    expect(historyToCloseOnLeaving(rows, { orgName: "", leavingOn: "2026-08-31" })?.id).toBe("h1");
  });

  it("すでに同じ退職日が入っていれば返さない", () => {
    const closed = [{ ...rows[0], end_date: "2026-08-31" }];
    expect(historyToCloseOnLeaving(closed, { orgName: "有限会社國崎青果", leavingOn: "2026-08-31" })).toBeNull();
  });

  it("雇用開始日より前の退職日は入れない", () => {
    expect(
      historyToCloseOnLeaving(rows, { orgName: "有限会社國崎青果", leavingOn: "2025-01-01" }),
    ).toBeNull();
  });

  it("退職日が空・当てはまる職歴が無いときは返さない", () => {
    expect(historyToCloseOnLeaving(rows, { orgName: "有限会社國崎青果", leavingOn: "" })).toBeNull();
    expect(historyToCloseOnLeaving(rows, { orgName: "別の会社", leavingOn: "2026-08-31" })).toBeNull();
  });
});

describe("orgEmploymentDates（同じ会社の職歴が分かれているとき）", () => {
  // 更新のたびに行が分かれ、期間が重なっている（入社は2025-07-22、いまも在籍中）
  const split = [
    history({ org_name: "有限会社 國崎青果", start_date: "2025-07-22", end_date: "2026-07-22" }),
    history({ org_name: "有限会社 國崎青果", start_date: "2026-07-08", end_date: null }),
  ];

  it("つながっている職歴はまとめて、いちばん古い開始日を雇用開始日にする", () => {
    expect(
      orgEmploymentDates({
        orgName: "有限会社 國崎青果",
        histories: split,
        orgStartOn: null,
        employmentStartOn: null,
        leavingOn: null,
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2025-07-22", leavingOn: null });
  });

  it("いったん辞めて入り直した（期間が離れている）ときは、新しいほうの在籍を使う", () => {
    const rehired = [
      history({ org_name: "有限会社 國崎青果", start_date: "2022-04-01", end_date: "2023-03-31" }),
      history({ org_name: "有限会社 國崎青果", start_date: "2025-07-22", end_date: "2026-07-22" }),
    ];
    expect(
      orgEmploymentDates({
        orgName: "有限会社 國崎青果",
        histories: rehired,
        orgStartOn: null,
        employmentStartOn: null,
        leavingOn: null,
        hasCurrentOrg: true,
      }),
    ).toEqual({ employmentStartOn: "2025-07-22", leavingOn: "2026-07-22" });
  });
});
