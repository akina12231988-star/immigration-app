import { describe, expect, it } from "vitest";
import {
  contractDatesForOrg,
  employmentStartForOrg,
  normalizeOrgEmploymentStarts,
  upsertOrgContractDates,
  upsertOrgEmploymentStart,
} from "./org-employment";

describe("normalizeOrgEmploymentStarts", () => {
  it("欠けたキーを補完し、配列でなければ空配列", () => {
    expect(normalizeOrgEmploymentStarts([{ organization_id: "org1" }])).toEqual([
      { organization_id: "org1", start_on: "", contract_on: "", conditions_on: "" },
    ]);
    expect(normalizeOrgEmploymentStarts(null)).toEqual([]);
    expect(normalizeOrgEmploymentStarts("x")).toEqual([]);
  });
});

describe("employmentStartForOrg", () => {
  const entries = [
    { organization_id: "org1", start_on: "2024-04-01" },
    { organization_id: "org2", start_on: "2026-07-31" },
    { organization_id: "org3", start_on: "" },
  ];

  it("機関IDに対応する雇用開始日を返す", () => {
    expect(employmentStartForOrg(entries, "org1")).toBe("2024-04-01");
    expect(employmentStartForOrg(entries, "org2")).toBe("2026-07-31");
  });

  it("未登録・日付未入力・ID未指定は null", () => {
    expect(employmentStartForOrg(entries, "org9")).toBeNull();
    expect(employmentStartForOrg(entries, "org3")).toBeNull();
    expect(employmentStartForOrg(entries, null)).toBeNull();
  });
});

describe("upsertOrgEmploymentStart", () => {
  it("同じ機関の行があれば日付を上書きする", () => {
    const entries = [{ organization_id: "org1", start_on: "2024-04-01" }];
    expect(upsertOrgEmploymentStart(entries, "org1", "2026-08-01")).toEqual([
      { organization_id: "org1", start_on: "2026-08-01" },
    ]);
  });

  it("無ければ行を追加する（既存行はそのまま）", () => {
    const entries = [{ organization_id: "org1", start_on: "2024-04-01" }];
    expect(upsertOrgEmploymentStart(entries, "org2", "2026-08-01")).toEqual([
      { organization_id: "org1", start_on: "2024-04-01" },
      { organization_id: "org2", start_on: "2026-08-01" },
    ]);
  });
});

describe("契約書の日付（雇用契約日・雇用条件書の作成日）", () => {
  it("保存済みの契約書の日付を消さずに読み込む", () => {
    expect(
      normalizeOrgEmploymentStarts([
        {
          organization_id: "org1",
          start_on: "2026-08-01",
          contract_on: "2026-06-01",
          conditions_on: "2026-06-02",
        },
      ]),
    ).toEqual([
      {
        organization_id: "org1",
        start_on: "2026-08-01",
        contract_on: "2026-06-01",
        conditions_on: "2026-06-02",
      },
    ]);
  });

  it("機関ごとの契約書の日付を取り出す（未登録は空）", () => {
    const entries = normalizeOrgEmploymentStarts([
      { organization_id: "org1", contract_on: "2026-06-01", conditions_on: "2026-06-02" },
      { organization_id: "org2", start_on: "2026-08-01" },
    ]);
    expect(contractDatesForOrg(entries, "org1")).toEqual({
      contract_on: "2026-06-01",
      conditions_on: "2026-06-02",
    });
    expect(contractDatesForOrg(entries, "org2")).toEqual({ contract_on: "", conditions_on: "" });
    expect(contractDatesForOrg(entries, null)).toEqual({ contract_on: "", conditions_on: "" });
  });

  it("契約書の日付を入れても、その機関の雇用開始日は変えない", () => {
    const entries = [{ organization_id: "org1", start_on: "2026-08-01" }];
    expect(upsertOrgContractDates(entries, "org1", { contract_on: "2026-06-01" })).toEqual([
      { organization_id: "org1", start_on: "2026-08-01", contract_on: "2026-06-01" },
    ]);
  });

  it("その機関の行がまだ無ければ足す（雇用開始日は空のまま）", () => {
    expect(upsertOrgContractDates([], "org2", { conditions_on: "2026-06-02" })).toEqual([
      { organization_id: "org2", start_on: "", conditions_on: "2026-06-02" },
    ]);
  });

  it("片方だけ直しても、もう片方は消えない", () => {
    const entries = [
      {
        organization_id: "org1",
        start_on: "",
        contract_on: "2026-06-01",
        conditions_on: "2026-06-02",
      },
    ];
    expect(upsertOrgContractDates(entries, "org1", { contract_on: "2026-07-01" })).toEqual([
      {
        organization_id: "org1",
        start_on: "",
        contract_on: "2026-07-01",
        conditions_on: "2026-06-02",
      },
    ]);
  });
});
