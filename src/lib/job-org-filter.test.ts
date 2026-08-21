import { describe, expect, it } from "vitest";
import { hiredOrgOptions, jobOrgName, jobOrgOptions, type JobOrgRow } from "./job-org-filter";

const row = (over: Partial<JobOrgRow> = {}): JobOrgRow => ({
  organization_id: "o1",
  result: "採用",
  organizations: { id: "o1", name: "有限会社國崎青果" },
  job_postings: null,
  ...over,
});

describe("jobOrgName", () => {
  it("求人票の掲載社名があればそれを使う", () => {
    expect(jobOrgName(row({ job_postings: { display_company: "國崎青果（農業）" } }))).toBe(
      "國崎青果（農業）",
    );
  });

  it("求人票が無ければ所属機関の名称を使う", () => {
    expect(jobOrgName(row())).toBe("有限会社國崎青果");
  });

  it("どちらも無ければ「応募先なし」", () => {
    expect(jobOrgName(row({ organizations: null }))).toBe("応募先なし");
  });
});

describe("jobOrgOptions", () => {
  it("会社ごとに応募と採用を数える", () => {
    const options = jobOrgOptions([
      row(),
      row({ result: "不採用" }),
      row({ organization_id: "o2", organizations: { id: "o2", name: "BASE株式会社" } }),
    ]);
    expect(options).toEqual([
      { id: "o1", name: "有限会社國崎青果", total: 2, hired: 1 },
      { id: "o2", name: "BASE株式会社", total: 1, hired: 1 },
    ]);
  });

  it("採用の多い順に並べる", () => {
    const options = jobOrgOptions([
      row({ organization_id: "o1", organizations: { id: "o1", name: "A社" }, result: "不採用" }),
      row({ organization_id: "o2", organizations: { id: "o2", name: "B社" } }),
      row({ organization_id: "o2", organizations: { id: "o2", name: "B社" } }),
    ]);
    expect(options.map((o) => o.name)).toEqual(["B社", "A社"]);
  });

  it("採用の数が同じなら応募の多い順、それも同じなら会社名の順", () => {
    const options = jobOrgOptions([
      row({ organization_id: "o2", organizations: { id: "o2", name: "い社" }, result: "辞退" }),
      row({ organization_id: "o1", organizations: { id: "o1", name: "あ社" }, result: "辞退" }),
      row({ organization_id: "o3", organizations: { id: "o3", name: "う社" }, result: "辞退" }),
      row({ organization_id: "o3", organizations: { id: "o3", name: "う社" }, result: "辞退" }),
    ]);
    expect(options.map((o) => o.name)).toEqual(["う社", "あ社", "い社"]);
  });

  it("会社が分からない応募は選択肢に出さない", () => {
    expect(jobOrgOptions([row({ organization_id: "" })])).toEqual([]);
  });

  it("応募が無ければ選択肢も無い", () => {
    expect(jobOrgOptions([])).toEqual([]);
  });
});

describe("hiredOrgOptions", () => {
  it("採用が出ている会社だけを返す", () => {
    const options = hiredOrgOptions([
      row(),
      row({ organization_id: "o2", organizations: { id: "o2", name: "BASE株式会社" }, result: "不採用" }),
    ]);
    expect(options.map((o) => o.name)).toEqual(["有限会社國崎青果"]);
  });
});
