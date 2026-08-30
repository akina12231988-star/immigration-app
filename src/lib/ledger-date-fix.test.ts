import { describe, expect, it } from "vitest";
import { planLedgerDateFixes, type LedgerFixInputRow } from "./ledger-date-fix";

function row(over: Partial<LedgerFixInputRow>): LedgerFixInputRow {
  return {
    id: "a1",
    workerId: "w1",
    workerName: "NGUYEN VAN A",
    company: "テスト株式会社",
    postingId: null,
    postingReceivedOn: null,
    jobseekerAcceptedOn: null,
    appliedOn: "2026-05-10",
    resultOn: null,
    result: "選考中",
    ...over,
  };
}

describe("planLedgerDateFixes", () => {
  it("採用年月日が1年近く前なら、年の入れ違いとして1年あとへ", () => {
    // SAN SREYLEAK の例: 採用 2025-05-14 / 紹介 2026-05-10
    const plan = planLedgerDateFixes([
      row({ result: "採用", resultOn: "2025-05-14", appliedOn: "2026-05-10" }),
    ]);
    expect(plan.applicationPatches.get("a1")).toEqual({ result_on: "2026-05-14" });
    expect(plan.changes).toHaveLength(1);
    expect(plan.unresolved).toEqual([]);
  });

  it("採用年月日が少し前なら、紹介年月日を採用年月日に合わせる", () => {
    // 國崎青果の例: 採用 2026-01-09 / 紹介 2026-01-13
    const plan = planLedgerDateFixes([
      row({ result: "採用", resultOn: "2026-01-09", appliedOn: "2026-01-13" }),
    ]);
    expect(plan.applicationPatches.get("a1")).toEqual({ applied_on: "2026-01-09" });
  });

  it("求人受付年月日が紹介より後なら、いちばん早い紹介年月日に合わせる", () => {
    const plan = planLedgerDateFixes([
      row({ postingId: "p1", postingReceivedOn: "2026-04-13", appliedOn: "2026-04-12" }),
      row({ id: "a2", postingId: "p1", postingReceivedOn: "2026-04-13", appliedOn: "2026-04-20" }),
    ]);
    expect(plan.postingPatches.get("p1")).toBe("2026-04-12");
    expect(plan.changes.filter((c) => c.target === "求人")).toHaveLength(1);
  });

  it("求職受付日が応募より後なら、いちばん早い紹介年月日に合わせる", () => {
    const plan = planLedgerDateFixes([
      row({ jobseekerAcceptedOn: "2026-06-29", appliedOn: "2026-05-29" }),
    ]);
    expect(plan.workerPatches.get("w1")).toBe("2026-05-29");
  });

  it("紹介年月日を直したうえで、受付日もその日付に合わせる", () => {
    // 採用 2026-03-20 / 紹介 2026-03-25 / 求職受付 2026-04-01 →
    // 紹介を 03-20 に直し、求職受付も 03-20 に
    const plan = planLedgerDateFixes([
      row({
        result: "採用",
        resultOn: "2026-03-20",
        appliedOn: "2026-03-25",
        jobseekerAcceptedOn: "2026-04-01",
      }),
    ]);
    expect(plan.applicationPatches.get("a1")).toEqual({ applied_on: "2026-03-20" });
    expect(plan.workerPatches.get("w1")).toBe("2026-03-20");
  });

  it("日付の並びに問題が無ければ何も変えない", () => {
    const plan = planLedgerDateFixes([
      row({
        result: "採用",
        resultOn: "2026-05-14",
        appliedOn: "2026-05-10",
        postingId: "p1",
        postingReceivedOn: "2026-05-01",
        jobseekerAcceptedOn: "2026-05-01",
      }),
    ]);
    expect(plan.changes).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it("採用と紹介が離れすぎていて年ずらしでも直らないときは、自動では直さない", () => {
    // 採用が紹介の2年以上前（1年ずらしても届かない）
    const plan = planLedgerDateFixes([
      row({ result: "採用", resultOn: "2024-01-01", appliedOn: "2026-05-10" }),
    ]);
    expect(plan.applicationPatches.size).toBe(0);
    expect(plan.unresolved).toHaveLength(1);
  });
});
