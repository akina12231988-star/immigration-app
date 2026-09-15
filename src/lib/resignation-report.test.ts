import { describe, expect, it } from "vitest";
import {
  isPastLeavingDate,
  isTokuteiKatsudoResidence,
  resignationFlowLabel,
  resignationReportNeeded,
  shouldRetireWorker,
} from "./resignation-report";

describe("resignationReportNeeded", () => {
  it("特定技能1号・2号は随時報告書が必要", () => {
    expect(resignationReportNeeded("特定技能1号")).toBe(true);
    expect(resignationReportNeeded("特定技能2号")).toBe(true);
  });
  it("特定活動は随時報告書が不要（表記のゆれも拾う）", () => {
    expect(resignationReportNeeded("特定活動（特定技能1号以降準備）")).toBe(false);
    expect(resignationReportNeeded("特定活動（特定技能1号移行準備）")).toBe(false);
    expect(isTokuteiKatsudoResidence("特定活動")).toBe(true);
  });
  it("在留資格が未設定なら念のため必要あつかい", () => {
    expect(resignationReportNeeded("")).toBe(true);
    expect(resignationReportNeeded(null)).toBe(true);
  });
  it("案内文が在留資格で切り替わる", () => {
    expect(resignationFlowLabel("特定技能1号")).toContain("随時報告書（届出書）を作成");
    expect(resignationFlowLabel("特定活動（特定技能1号以降準備）")).toContain("日割り計算");
  });
});

describe("isPastLeavingDate", () => {
  it("退職日の翌日から過ぎたあつかい（当日はまだ在籍）", () => {
    expect(isPastLeavingDate("2026-09-14", "2026-09-15")).toBe(true);
    expect(isPastLeavingDate("2026-09-15", "2026-09-15")).toBe(false);
    expect(isPastLeavingDate("2026-09-16", "2026-09-15")).toBe(false);
    expect(isPastLeavingDate(null, "2026-09-15")).toBe(false);
  });
});

describe("shouldRetireWorker", () => {
  const worker = {
    status: "在籍中",
    leaving_on: "2026-09-10",
    current_organization_id: "org-a",
    employment_start_on: "2025-04-01",
  };
  const resignation = { organization_id: "org-a", leaving_on: "2026-09-10" };

  it("退職日を過ぎていて在籍が続いていなければ退職にする", () => {
    expect(shouldRetireWorker(worker, resignation, "2026-09-15")).toBe(true);
  });
  it("退職日当日まではまだ退職にしない", () => {
    expect(shouldRetireWorker(worker, resignation, "2026-09-10")).toBe(false);
  });
  it("すでに退職・帰国の人は対象外", () => {
    expect(shouldRetireWorker({ ...worker, status: "退職" }, resignation, "2026-09-15")).toBe(false);
    expect(shouldRetireWorker({ ...worker, status: "帰国" }, resignation, "2026-09-15")).toBe(false);
  });
  it("外国人情報の退職日を空にした（再雇用）なら退職にしない", () => {
    expect(shouldRetireWorker({ ...worker, leaving_on: null }, resignation, "2026-09-15")).toBe(false);
  });
  it("別の所属機関に転職済みなら退職にしない", () => {
    expect(
      shouldRetireWorker({ ...worker, current_organization_id: "org-b" }, resignation, "2026-09-15"),
    ).toBe(false);
  });
  it("退職日より後に雇用が始まっている（同じ機関で再雇用）なら退職にしない", () => {
    expect(
      shouldRetireWorker({ ...worker, employment_start_on: "2026-09-12" }, resignation, "2026-09-15"),
    ).toBe(false);
  });
  it("所属機関が未設定でも退職日が一致すれば退職にする", () => {
    expect(
      shouldRetireWorker({ ...worker, current_organization_id: null }, resignation, "2026-09-15"),
    ).toBe(true);
  });
});
