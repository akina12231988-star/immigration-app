import { describe, expect, it } from "vitest";
import { employmentStartAt, hasEmploymentStarted } from "./job-employment-start";

const ORG = "org-1";
const OTHER = "org-2";

describe("employmentStartAt", () => {
  it("所属機関別の雇用開始日を使う", () => {
    const w = {
      id: "w1",
      org_employment_starts: [{ organization_id: ORG, start_on: "2026-06-19" }],
    };
    expect(employmentStartAt(w, ORG)).toBe("2026-06-19");
    expect(employmentStartAt(w, OTHER)).toBeNull();
  });

  it("機関別の記録が無ければ、今その機関にいる人の雇用開始日を使う", () => {
    const w = {
      id: "w1",
      current_organization_id: ORG,
      employment_start_on: "2026-04-01",
      org_employment_starts: [],
    };
    expect(employmentStartAt(w, ORG)).toBe("2026-04-01");
    expect(employmentStartAt(w, OTHER)).toBeNull();
  });

  it("開始日が空なら未開始", () => {
    const w = { id: "w1", current_organization_id: ORG, employment_start_on: null };
    expect(hasEmploymentStarted(w, ORG)).toBe(false);
    expect(hasEmploymentStarted(undefined, ORG)).toBe(false);
  });

  it("応募に所属機関が無いときは、どこかで雇用開始していれば済み扱い", () => {
    const w = {
      id: "w1",
      org_employment_starts: [{ organization_id: OTHER, start_on: "2026-05-01" }],
    };
    expect(employmentStartAt(w, null)).toBe("2026-05-01");
  });
});
