import { describe, expect, it } from "vitest";
import { employmentStartForApplication, planDatesByWorker } from "./application-employment-start";
import type { PlanDatesSummary } from "@/lib/supabase/queries/plan-dates";

const plan = (todo_no: string, es: string, updated_at = "2026-10-01"): PlanDatesSummary => ({
  worker_id: "w1",
  todo_no,
  dates: { es, doc: "2026-10-10" },
  updated_at,
});

describe("employmentStartForApplication（審査中の申請に出す雇用開始日）", () => {
  it("申請の記録に雇用開始日があればそれを最優先で出す", () => {
    expect(
      employmentStartForApplication({
        app: { employmentStartOn: "2026-12-01" },
        worker: { employment_start_on: "2026-11-01", residence_renewal_todo: "TODO-1" },
        planDates: [plan("TODO-1", "2026-11-20")],
      }),
    ).toEqual({ date: "2026-12-01", source: "申請の記録" });
  });

  it("支援計画書の日付は、その申請のTODO番号の保存分を優先し、無ければいちばん新しい保存分", () => {
    expect(
      employmentStartForApplication({
        app: {},
        worker: { employment_start_on: null, residence_renewal_todo: "TODO-2" },
        planDates: [plan("TODO-3", "2026-12-15", "2026-10-20"), plan("TODO-2", "2026-11-20", "2026-10-01")],
      }),
    ).toEqual({ date: "2026-11-20", source: "支援計画書の日付" });
    expect(
      employmentStartForApplication({
        app: {},
        worker: { employment_start_on: null, residence_renewal_todo: "" },
        planDates: [plan("TODO-3", "2026-12-15", "2026-10-20"), plan("TODO-2", "2026-11-20", "2026-10-01")],
      }),
    ).toEqual({ date: "2026-12-15", source: "支援計画書の日付" });
  });

  it("支援計画書の日付が無ければ外国人の基本情報の雇用開始日。それも無ければ null", () => {
    expect(
      employmentStartForApplication({
        app: {},
        worker: { employment_start_on: "2026-11-01" },
        planDates: [],
      }),
    ).toEqual({ date: "2026-11-01", source: "外国人の基本情報" });
    expect(employmentStartForApplication({ app: {}, worker: null, planDates: [] })).toBeNull();
    // 保存分に雇用開始日が入っていない（空）ときも基本情報へ
    expect(
      employmentStartForApplication({
        app: {},
        worker: { employment_start_on: "2026-11-01" },
        planDates: [{ worker_id: "w1", todo_no: "", dates: {}, updated_at: "" }],
      })?.source,
    ).toBe("外国人の基本情報");
  });
});

describe("planDatesByWorker", () => {
  it("外国人IDごとに新しい順のままにまとめる（IDの無い行は除く）", () => {
    const map = planDatesByWorker([
      plan("A", "2026-01-01", "2026-10-20"),
      { ...plan("B", "2026-02-01", "2026-10-10"), worker_id: "w2" },
      plan("C", "2026-03-01", "2026-10-01"),
      { ...plan("D", "2026-04-01"), worker_id: null },
    ]);
    expect(map.get("w1")?.map((r) => r.todo_no)).toEqual(["A", "C"]);
    expect(map.get("w2")?.map((r) => r.todo_no)).toEqual(["B"]);
    expect(map.size).toBe(2);
  });
});
