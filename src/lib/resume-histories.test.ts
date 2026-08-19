import { describe, expect, it } from "vitest";
import { mergeResumeHistories } from "./resume-histories";

const base = {
  histories: [
    {
      id: "h1",
      visa: "技能実習",
      start_date: "2023-04-01",
      end_date: "2026-03-31",
      org_name: "大家農園",
      role: "耕種農業",
    },
  ],
  employmentStarts: [
    { organization_id: "org-kunisaki", orgName: "有限会社國崎青果", start_on: "2026-06-19" },
  ],
  resignations: [],
  residenceStatus: "特定技能1号",
  currentOrganizationId: "org-kunisaki",
  workerStatus: "在籍中",
  workerLeavingOn: null,
};

describe("mergeResumeHistories", () => {
  it("雇用開始日（所属機関別）を職歴に足す（在職中は終了日なし）", () => {
    const rows = mergeResumeHistories(base);
    expect(rows.map((r) => r.org)).toEqual(["大家農園", "有限会社國崎青果"]);
    expect(rows[1]).toMatchObject({
      visa: "特定技能1号",
      start: "2026-06-19",
      end: null,
    });
  });

  it("退職の記録があれば終了日として反映する", () => {
    const rows = mergeResumeHistories({
      ...base,
      resignations: [
        { organization_id: "org-kunisaki", org_name: "有限会社國崎青果", leaving_on: "2026-12-05" },
      ],
    });
    expect(rows[1].end).toBe("2026-12-05");
  });

  it("退職者情報（現在の機関で退職済み）も終了日にする", () => {
    const rows = mergeResumeHistories({
      ...base,
      workerStatus: "退職",
      workerLeavingOn: "2026-11-30",
    });
    expect(rows[1].end).toBe("2026-11-30");
  });

  it("職歴に同じ機関の行が手入力済みなら足さない（表記ゆれも同じ機関とみなす）", () => {
    const rows = mergeResumeHistories({
      ...base,
      histories: [
        {
          id: "h2",
          visa: "特定技能1号",
          start_date: "2026-06-19",
          end_date: null,
          org_name: "國崎青果",
          role: "耕種農業",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("h2");
  });

  it("開始日が入っていない雇用開始の記録は足さない", () => {
    const rows = mergeResumeHistories({
      ...base,
      employmentStarts: [{ organization_id: "org-x", orgName: "テスト", start_on: "" }],
    });
    expect(rows).toHaveLength(1);
  });

  it("開始日順に並ぶ", () => {
    const rows = mergeResumeHistories({
      ...base,
      employmentStarts: [
        { organization_id: "org-a", orgName: "A社", start_on: "2020-01-01" },
        ...base.employmentStarts,
      ],
    });
    expect(rows.map((r) => r.start)).toEqual(["2020-01-01", "2023-04-01", "2026-06-19"]);
  });

  it("退職日が開始日より前の退職記録は使わない（前の在籍の退職）", () => {
    const rows = mergeResumeHistories({
      ...base,
      resignations: [
        { organization_id: "org-kunisaki", org_name: "有限会社國崎青果", leaving_on: "2026-01-01" },
      ],
    });
    expect(rows[1].end).toBeNull();
  });
});
