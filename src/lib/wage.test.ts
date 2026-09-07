import { describe, expect, it } from "vitest";
import {
  currentWage,
  pendingWagePatch,
  sortWages,
  wageRaise,
  wageStartedOn,
  wageStartedOnLabel,
  wageText,
} from "./wage";
import type { WorkerWage } from "@/types/db";

const wage = (over: Partial<WorkerWage> & { started_on: string | null }): WorkerWage =>
  ({
    id: over.started_on ?? "pending",
    worker_id: "W",
    organization_id: "org-1",
    kind: "時給",
    amount: 1100,
    reason: "",
    note: "",
    created_at: `${over.started_on ?? "2026-01-01"}T00:00:00Z`,
    updated_at: `${over.started_on ?? "2026-01-01"}T00:00:00Z`,
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

describe("申請時の賃金（適用開始日が空＝雇用開始日から）", () => {
  const pending = wage({ started_on: null, amount: 1200, reason: "申請時" });

  it("適用開始日は雇用開始日になり、雇用開始日が無ければ未定", () => {
    expect(wageStartedOn(pending, "2026-10-01")).toBe("2026-10-01");
    expect(wageStartedOn(pending, null)).toBeNull();
    expect(wageStartedOn(wage({ started_on: "2025-04-01" }), "2026-10-01")).toBe("2025-04-01");
  });

  it("表示は「雇用開始日（日付）から」、未定なら「雇用開始日から（未定）」", () => {
    expect(wageStartedOnLabel(pending, "2026-10-01")).toBe("雇用開始日（2026-10-01）から");
    expect(wageStartedOnLabel(pending)).toBe("雇用開始日から（未定）");
    expect(wageStartedOnLabel(wage({ started_on: "2025-04-01" }))).toBe("2025-04-01");
  });

  it("申請時の賃金だけなら、雇用開始日が未定でもそれが現在の賃金", () => {
    expect(currentWage([pending], "2026-09-07")?.amount).toBe(1200);
  });

  it("転職前の賃金があるときは、雇用開始日が来るまで前の賃金が現在の賃金", () => {
    const old = wage({ started_on: "2024-04-01", amount: 1000 });
    expect(currentWage([old, pending], "2026-09-07", "2026-10-01")?.amount).toBe(1000);
    expect(currentWage([old, pending], "2026-10-01", "2026-10-01")?.amount).toBe(1200);
    // 未定でも、これから始まる賃金として並びの先頭になる
    expect(sortWages([old, pending])[0].amount).toBe(1200);
    expect(currentWage([old, pending], "2026-09-07", null)?.amount).toBe(1000);
  });

  it("雇用開始になったら雇用開始日を書き込み、理由「申請時」は「採用時」になる", () => {
    expect(pendingWagePatch(pending, "2026-10-01")).toEqual({
      started_on: "2026-10-01",
      reason: "採用時",
    });
    // 理由を自分で書いていたら、それは変えない
    expect(pendingWagePatch(wage({ started_on: null, reason: "試用期間" }), "2026-10-01")).toEqual({
      started_on: "2026-10-01",
    });
    // 雇用開始日が無い・すでに日付がある記録には何もしない
    expect(pendingWagePatch(pending, null)).toBeNull();
    expect(pendingWagePatch(wage({ started_on: "2025-04-01", reason: "申請時" }), "2026-10-01")).toBeNull();
  });
});
