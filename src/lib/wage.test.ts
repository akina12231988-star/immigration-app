import { describe, expect, it } from "vitest";
import { currentWage, sortWages, wageRaise, wageText } from "./wage";
import type { WorkerWage } from "@/types/db";

const wage = (over: Partial<WorkerWage> & { started_on: string }): WorkerWage =>
  ({
    id: over.started_on,
    worker_id: "W",
    organization_id: "org-1",
    kind: "時給",
    amount: 1100,
    reason: "",
    note: "",
    created_at: `${over.started_on}T00:00:00Z`,
    updated_at: `${over.started_on}T00:00:00Z`,
    ...over,
  }) as WorkerWage;

describe("賃金の表示", () => {
  it("区分と金額を並べる", () => {
    expect(wageText("時給", 1100)).toBe("時給1,100円");
    expect(wageText("月給", 250000)).toBe("月給250,000円");
    expect(wageText("時給", 0)).toBe("");
  });
});

describe("現在の賃金", () => {
  const wages = [
    wage({ started_on: "2024-04-01", amount: 1000, reason: "採用時" }),
    wage({ started_on: "2025-04-01", amount: 1100, reason: "昇給" }),
    wage({ started_on: "2026-04-01", amount: 1180, reason: "昇給" }),
  ];

  it("適用開始日の新しい順に並べる", () => {
    expect(sortWages(wages).map((w) => w.started_on)).toEqual([
      "2026-04-01",
      "2025-04-01",
      "2024-04-01",
    ]);
  });

  it("基準日までに始まっているもののうち一番新しいものが現在の賃金", () => {
    expect(currentWage(wages, "2026-08-08")?.amount).toBe(1180);
    expect(currentWage(wages, "2025-12-31")?.amount).toBe(1100);
    expect(currentWage(wages, "2024-06-01")?.amount).toBe(1000);
  });

  it("先の日付で登録した昇給は、その日が来るまで現在の賃金にならない", () => {
    const withFuture = [...wages, wage({ started_on: "2027-04-01", amount: 1250 })];
    expect(currentWage(withFuture, "2026-08-08")?.amount).toBe(1180);
    expect(currentWage(withFuture, "2027-04-01")?.amount).toBe(1250);
  });

  it("記録がなければ null", () => {
    expect(currentWage([], "2026-08-08")).toBeNull();
  });
});

describe("前回比（昇給額）", () => {
  const wages = [
    wage({ started_on: "2024-04-01", amount: 1000 }),
    wage({ started_on: "2025-04-01", amount: 1100 }),
  ];

  it("1つ前の記録との差", () => {
    const sorted = sortWages(wages);
    expect(wageRaise(sorted, sorted[0])).toBe(100);
    // 一番古い記録には比べる相手がいない
    expect(wageRaise(sorted, sorted[1])).toBeNull();
  });

  it("区分が違う記録とは比べない（時給と月給を混ぜない）", () => {
    const mixed = sortWages([
      wage({ started_on: "2024-04-01", amount: 1100, kind: "時給" }),
      wage({ started_on: "2025-04-01", amount: 220000, kind: "月給" }),
    ]);
    expect(wageRaise(mixed, mixed[0])).toBeNull();
  });
});
