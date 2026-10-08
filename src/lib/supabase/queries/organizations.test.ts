import { describe, expect, it } from "vitest";
import { rosterIsCurrent } from "@/lib/supabase/queries/organizations";

const ORG = "org-now";
const PREV = "org-prev";

describe("rosterIsCurrent（所属機関の在籍名簿で「在籍中」に並べるか）", () => {
  it("この機関に紐づいていて退職日が無ければ在籍中", () => {
    expect(
      rosterIsCurrent(
        { current_organization_id: ORG, leaving_on: null, employment_start_on: "2025-04-01", org_employment_starts: [] },
        ORG,
      ),
    ).toBe(true);
  });

  it("別の機関に紐づいている人は在籍中ではない", () => {
    expect(
      rosterIsCurrent(
        { current_organization_id: PREV, leaving_on: null, employment_start_on: "2025-04-01", org_employment_starts: [] },
        ORG,
      ),
    ).toBe(false);
  });

  it("この機関での退職日が入っていれば在籍中ではない", () => {
    expect(
      rosterIsCurrent(
        { current_organization_id: ORG, leaving_on: "2026-09-30", employment_start_on: "2025-04-01", org_employment_starts: [] },
        ORG,
      ),
    ).toBe(false);
  });

  it("転職した人: 前の機関の退職日（今の機関の雇用開始日より前）が残っていても在籍中", () => {
    expect(
      rosterIsCurrent(
        {
          current_organization_id: ORG,
          leaving_on: "2026-08-09",
          employment_start_on: "2026-08-10",
          org_employment_starts: [
            { organization_id: PREV, start_on: "2025-04-01", contract_on: "", conditions_on: "" },
            { organization_id: ORG, start_on: "2026-08-10", contract_on: "", conditions_on: "" },
          ],
        },
        ORG,
      ),
    ).toBe(true);
  });

  it("org_employment_starts が配列でない（古い記録）でも落ちない", () => {
    expect(
      rosterIsCurrent(
        { current_organization_id: ORG, leaving_on: "2026-08-09", employment_start_on: "2026-08-10", org_employment_starts: null },
        ORG,
      ),
    ).toBe(true);
  });
});
