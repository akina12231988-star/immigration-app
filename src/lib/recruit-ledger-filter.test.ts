import { describe, expect, it } from "vitest";
import {
  filterPostingLedger,
  filterSeekerLedger,
  listNoLabel,
} from "./recruit-ledger-filter";
import type { PostingLedgerEntry, SeekerLedgerEntry } from "./recruit-ledgers";

function posting(id: string, orgName: string): PostingLedgerEntry {
  return {
    id,
    organization_id: null,
    acceptance_no: `8-${id}`,
    org_name: orgName,
    org_address: "",
    contact: "",
    received_on: "2026-04-01",
    valid_until: "2026-07-01",
    openings: 1,
    job_type: "耕種農業",
    work_location: "",
    employment_period: "",
    wage: "",
    note: "",
    applications: [],
  };
}

function seeker(name: string): SeekerLedgerEntry {
  return {
    jobseeker_no: "",
    name,
    address: "",
    birth: "",
    desired_job_type: "",
    accepted_on: "",
    valid_until: "",
    note: "",
    applications: [],
  };
}

describe("filterPostingLedger", () => {
  const entries = [posting("p1", "A社"), posting("p2", "B社"), posting("p3", "C社")];

  it("当日点検で選ばれた求人だけにする（全件は出さない）", () => {
    expect(filterPostingLedger(entries, ["p1", "p3"]).map((e) => e.org_name)).toEqual([
      "A社",
      "C社",
    ]);
  });

  it("何も選ばれていなければ0件（うっかり全件出さない）", () => {
    expect(filterPostingLedger(entries, [])).toEqual([]);
  });
});

describe("filterSeekerLedger", () => {
  const entries = [seeker("MEAS HENG"), seeker("VUONG VAN THANH"), seeker("LAM THI HUE")];

  it("選んだ求職者だけにする", () => {
    expect(filterSeekerLedger(entries, ["MEAS HENG", "LAM THI HUE"]).map((e) => e.name)).toEqual([
      "MEAS HENG",
      "LAM THI HUE",
    ]);
  });

  it("前後の空白があっても選べる", () => {
    expect(filterSeekerLedger(entries, [" MEAS HENG "]).map((e) => e.name)).toEqual(["MEAS HENG"]);
  });

  it("空の氏名は無視する（うっかり全件出さない）", () => {
    expect(filterSeekerLedger(entries, ["", "  "])).toEqual([]);
  });
});

describe("listNoLabel", () => {
  it("ファイル名に入れるリストNo.（小さい順）", () => {
    expect(listNoLabel([3, 1])).toBe("1・3");
    expect(listNoLabel([2])).toBe("2");
    expect(listNoLabel([])).toBe("");
  });
});
