import { describe, expect, it } from "vitest";
import {
  countOpenExtraRequests,
  extraRequestAlert,
  extraRequestDueLabel,
  isExtraRequestUrgent,
  sortExtraRequests,
} from "./extra-request-alerts";
import type { ApplicationExtraRequest, ExtraRequestStatus } from "@/types/application";

const TODAY = "2026-08-19";

type Row = Pick<ApplicationExtraRequest, "due_on" | "status" | "requested_on">;
const row = (due_on: string | null, status: ExtraRequestStatus = "本人へ依頼中", requested_on = "2026-08-18"): Row => ({
  due_on,
  status,
  requested_on,
});

describe("extraRequestAlert", () => {
  it("郵送済みは完了", () => {
    expect(extraRequestAlert(row("2026-08-01", "郵送済み"), TODAY)).toBe("done");
  });

  it("期限を過ぎていれば overdue", () => {
    expect(extraRequestAlert(row("2026-08-18"), TODAY)).toBe("overdue");
  });

  it("今日が期限なら today", () => {
    expect(extraRequestAlert(row("2026-08-19"), TODAY)).toBe("today");
  });

  it("3日以内は soon、それより先は normal", () => {
    expect(extraRequestAlert(row("2026-08-22"), TODAY)).toBe("soon");
    expect(extraRequestAlert(row("2026-08-23"), TODAY)).toBe("normal");
  });

  it("期限が未設定なら none", () => {
    expect(extraRequestAlert(row(null), TODAY)).toBe("none");
  });
});

describe("extraRequestDueLabel", () => {
  it("あと何日・何日超過まで出す", () => {
    expect(extraRequestDueLabel("2026-08-21", TODAY)).toBe("提出期限 2026-08-21（あと2日）");
    expect(extraRequestDueLabel("2026-08-19", TODAY)).toBe("提出期限 2026-08-19（本日まで）");
    expect(extraRequestDueLabel("2026-08-17", TODAY)).toBe("提出期限 2026-08-17（2日超過）");
    expect(extraRequestDueLabel(null, TODAY)).toBe("提出期限 未設定");
  });
});

describe("isExtraRequestUrgent", () => {
  it("超過・当日・3日以内が急ぎ、完了と余裕があるものは違う", () => {
    expect(isExtraRequestUrgent(row("2026-08-17"), TODAY)).toBe(true);
    expect(isExtraRequestUrgent(row("2026-08-22"), TODAY)).toBe(true);
    expect(isExtraRequestUrgent(row("2026-09-30"), TODAY)).toBe(false);
    expect(isExtraRequestUrgent(row("2026-08-17", "郵送済み"), TODAY)).toBe(false);
  });
});

describe("sortExtraRequests", () => {
  it("未完了が先、期限が近い順、期限なしは後ろ", () => {
    const rows = [
      row("2026-09-01"),
      row("2026-08-01", "郵送済み"),
      row(null),
      row("2026-08-20"),
    ];
    expect(sortExtraRequests(rows).map((r) => r.due_on)).toEqual([
      "2026-08-20",
      "2026-09-01",
      null,
      "2026-08-01",
    ]);
  });

  it("元の配列は変えない", () => {
    const rows = [row("2026-09-01"), row("2026-08-20")];
    sortExtraRequests(rows);
    expect(rows[0].due_on).toBe("2026-09-01");
  });
});

describe("countOpenExtraRequests", () => {
  it("郵送済み以外を数える", () => {
    expect(
      countOpenExtraRequests([row(null), row(null, "郵送済み"), row(null, "書類作成中")]),
    ).toBe(2);
  });
});
