import { describe, expect, it } from "vitest";
import {
  auditPairs,
  filterPostingLedger,
  filterSeekerLedger,
  listNoLabel,
  type AuditTarget,
} from "./recruit-ledger-filter";
import type {
  PostingLedgerApp,
  PostingLedgerEntry,
  SeekerLedgerApp,
  SeekerLedgerEntry,
} from "./recruit-ledgers";

function app(worker_name: string, result = "採用"): PostingLedgerApp {
  return { applied_on: "2026-05-01", worker_name, result, result_on: "2026-06-01" };
}

function posting(id: string, orgName: string, apps: PostingLedgerApp[]): PostingLedgerEntry {
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
    note: "過去データ取込（2026年4月〜）",
    applications: apps,
  };
}

function seekerApp(acceptance_no: string): SeekerLedgerApp {
  return {
    applied_on: "2026-05-01",
    acceptance_no,
    employer_name: "",
    result: "採用",
    result_on: "2026-06-01",
  };
}

function seeker(name: string, apps: SeekerLedgerApp[]): SeekerLedgerEntry {
  return {
    jobseeker_no: "",
    name,
    address: "",
    birth: "",
    desired_job_type: "",
    accepted_on: "",
    valid_until: "",
    note: "",
    applications: apps,
  };
}

const ENTRIES = [
  posting("p1", "井上洋介", [app("KPA PHI LA"), app("別の応募者"), app("さらに別の人", "不採用")]),
  posting("p2", "井上　雅夫", [app("関係ない人")]),
  posting("p3", "BASE株式会社", [app("NGET CHITTHA"), app("もう一人")]),
];

const TARGETS: AuditTarget[] = [
  { listNo: 1, postingId: "p1", workerName: "KPA PHI LA" },
  { listNo: 3, postingId: "p3", workerName: "NGET CHITTHA" },
];

describe("filterPostingLedger", () => {
  it("当日点検で選ばれた求人だけにする（全件は出さない）", () => {
    expect(filterPostingLedger(ENTRIES, TARGETS).map((e) => e.org_name)).toEqual([
      "井上洋介",
      "BASE株式会社",
    ]);
  });

  it("選んだ求職者の行だけにする（他の応募者は出さない）", () => {
    const rows = filterPostingLedger(ENTRIES, TARGETS);
    expect(rows[0].applications.map((a) => a.worker_name)).toEqual(["KPA PHI LA"]);
    expect(rows[1].applications.map((a) => a.worker_name)).toEqual(["NGET CHITTHA"]);
  });

  it("求職者を選んでいなければ、その求人の応募はそのまま出す", () => {
    const rows = filterPostingLedger(ENTRIES, [{ listNo: 1, postingId: "p1", workerName: "" }]);
    expect(rows[0].applications).toHaveLength(3);
  });

  it("何も選ばれていなければ0件（うっかり全件出さない）", () => {
    expect(filterPostingLedger(ENTRIES, [])).toEqual([]);
  });
});

describe("auditPairs", () => {
  it("求人受理番号と選んだ求職者の組み合わせを作る", () => {
    expect(auditPairs(ENTRIES, TARGETS)).toEqual([
      { acceptanceNo: "8-p1", workerName: "KPA PHI LA" },
      { acceptanceNo: "8-p3", workerName: "NGET CHITTHA" },
    ]);
  });

  it("求職者を選んでいなければ、採用になった人すべてを組み合わせにする", () => {
    expect(auditPairs(ENTRIES, [{ listNo: 1, postingId: "p1", workerName: "" }])).toEqual([
      { acceptanceNo: "8-p1", workerName: "KPA PHI LA" },
      { acceptanceNo: "8-p1", workerName: "別の応募者" },
    ]);
  });
});

describe("filterSeekerLedger", () => {
  const seekers = [
    seeker("KPA PHI LA", [seekerApp("8-p1"), seekerApp("8-other")]),
    seeker("NGET CHITTHA", [seekerApp("8-p3")]),
    seeker("関係ない人", [seekerApp("8-p2")]),
  ];

  it("選んだ求職者だけにする", () => {
    const pairs = auditPairs(ENTRIES, TARGETS);
    expect(filterSeekerLedger(seekers, pairs).map((e) => e.name)).toEqual([
      "KPA PHI LA",
      "NGET CHITTHA",
    ]);
  });

  it("点検する求人の行だけにする（他社への紹介は出さない）", () => {
    const pairs = auditPairs(ENTRIES, TARGETS);
    const rows = filterSeekerLedger(seekers, pairs);
    expect(rows[0].applications.map((a) => a.acceptance_no)).toEqual(["8-p1"]);
  });

  it("何も選ばれていなければ0件（うっかり全件出さない）", () => {
    expect(filterSeekerLedger(seekers, [])).toEqual([]);
  });
});

describe("listNoLabel", () => {
  it("ファイル名に入れるリストNo.（小さい順）", () => {
    expect(listNoLabel([3, 1])).toBe("1・3");
    expect(listNoLabel([2])).toBe("2");
    expect(listNoLabel([])).toBe("");
  });
});
