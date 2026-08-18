import { describe, expect, it } from "vitest";
import { buildPastPeriods, periodKeyFor } from "./worker-doc-periods";
import type { WorkHistoryRow } from "@/types/db";

const TODAY = "2026-08-18";

function history(over: Partial<WorkHistoryRow>): WorkHistoryRow {
  return {
    id: "h1",
    worker_id: "w1",
    org_name: "株式会社テスト",
    visa: "特定技能1号",
    start_date: "2024-04-01",
    end_date: null,
    job_type: "",
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  } as WorkHistoryRow;
}

describe("buildPastPeriods", () => {
  it("退職日が過ぎた在籍だけを過去の期間にする", () => {
    const rows = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].org).toBe("前の会社");
  });

  it("退職日が今日以降（まだ期間内）の在籍は過去にしない", () => {
    const rows = buildPastPeriods(
      [history({ org_name: "井上　洋介", start_date: "2026-08-10", end_date: "2027-02-10" })],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("在籍中（退職日なし）は過去にしない", () => {
    expect(buildPastPeriods([history({})], TODAY)).toHaveLength(0);
  });
});

describe("periodKeyFor", () => {
  it("今も期間内の在籍中に登録した画像は「現在」に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "井上　洋介", start_date: "2026-08-10", end_date: "2027-02-10" })],
      TODAY,
    );
    expect(periodKeyFor("2026-08-12T00:00:00Z", past, true)).toBe("current");
  });

  it("過去の在籍期間中に登録した画像はその期間に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(periodKeyFor("2024-05-01T00:00:00Z", past, true)).toBe(past[0].key);
  });

  it("最後の退職日より後に登録した画像は「現在」に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(periodKeyFor("2026-08-12T00:00:00Z", past, true)).toBe("current");
  });
});
