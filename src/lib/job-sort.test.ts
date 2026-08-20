import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_SORT, JOB_SORTS, sortJobApplications } from "./job-sort";

interface Row {
  id: string;
  applied_on: string;
  result_on?: string | null;
  start_on?: string | null;
}

const ROWS: Row[] = [
  { id: "a", applied_on: "2026-06-19", result_on: "2026-06-22", start_on: "2026-08-20" },
  { id: "b", applied_on: "2026-04-01", result_on: "2026-04-10", start_on: "2026-05-01" },
  { id: "c", applied_on: "2026-07-01", result_on: null, start_on: null },
  { id: "d", applied_on: "2026-05-15", result_on: "2026-07-30", start_on: null },
];

const startOf = (r: Row) => r.start_on ?? null;
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("sortJobApplications", () => {
  it("応募日の新しい順（既定）", () => {
    expect(ids(sortJobApplications(ROWS, DEFAULT_JOB_SORT, startOf))).toEqual(["c", "a", "d", "b"]);
  });

  it("応募日の古い順", () => {
    expect(ids(sortJobApplications(ROWS, "応募日（古い順）", startOf))).toEqual(["b", "d", "a", "c"]);
  });

  it("採用年月日（結果日）の新しい順。結果日が無いものは最後", () => {
    expect(ids(sortJobApplications(ROWS, "採用年月日（新しい順）", startOf))).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("採用年月日の古い順でも、結果日が無いものは最後", () => {
    expect(ids(sortJobApplications(ROWS, "採用年月日（古い順）", startOf))).toEqual([
      "b",
      "a",
      "d",
      "c",
    ]);
  });

  it("雇用開始日の古い順。まだ開始していない人は最後", () => {
    expect(ids(sortJobApplications(ROWS, "雇用開始日（古い順）", startOf))).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("雇用開始日の新しい順", () => {
    expect(ids(sortJobApplications(ROWS, "雇用開始日（新しい順）", startOf))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("同じ日なら応募日の新しい順（並びがぶれない）", () => {
    const same: Row[] = [
      { id: "x", applied_on: "2026-06-01", result_on: "2026-06-22" },
      { id: "y", applied_on: "2026-06-19", result_on: "2026-06-22" },
    ];
    expect(ids(sortJobApplications(same, "採用年月日（新しい順）"))).toEqual(["y", "x"]);
    expect(ids(sortJobApplications(same, "採用年月日（古い順）"))).toEqual(["y", "x"]);
  });

  it("元の配列は変えない", () => {
    const before = ids(ROWS);
    sortJobApplications(ROWS, "雇用開始日（古い順）", startOf);
    expect(ids(ROWS)).toEqual(before);
  });

  it("並びの選択肢はすべて動く", () => {
    for (const sort of JOB_SORTS) {
      expect(sortJobApplications(ROWS, sort, startOf)).toHaveLength(ROWS.length);
    }
  });
});
