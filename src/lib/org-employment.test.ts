import { describe, expect, it } from "vitest";
import {
  employmentStartForOrg,
  normalizeOrgEmploymentStarts,
} from "./org-employment";

describe("normalizeOrgEmploymentStarts", () => {
  it("欠けたキーを補完し、配列でなければ空配列", () => {
    expect(normalizeOrgEmploymentStarts([{ organization_id: "org1" }])).toEqual([
      { organization_id: "org1", start_on: "" },
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
