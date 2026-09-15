import { describe, expect, it } from "vitest";
import {
  employmentStartInRange,
  employmentStartPrintUrl,
  printDateLabel,
  printDateMode,
  printDateParam,
  printEmploymentStart,
} from "./worker-print-filter";

describe("printDateMode", () => {
  it("URLパラメータから日付の種類を決める（不明なら在留許可日）", () => {
    expect(printDateMode(undefined)).toBe("permit");
    expect(printDateMode("leaving")).toBe("leaving");
    expect(printDateMode("employment")).toBe("employment");
    expect(printDateMode("xxx")).toBe("permit");
  });
  it("種類とパラメータ・表示名が対応する", () => {
    expect(printDateParam("permit")).toBe("");
    expect(printDateParam("employment")).toBe("employment");
    expect(printDateLabel("employment")).toBe("雇用開始日");
    expect(printDateLabel("leaving")).toBe("退職日");
    expect(printDateLabel("permit")).toBe("在留許可日");
  });
});

describe("employmentStartInRange", () => {
  const worker = {
    employment_start_on: "2026-07-13",
    org_employment_starts: [{ organization_id: "org-b", start_on: "2026-09-05" }],
  };
  it("所属機関を指定すればその機関での雇用開始日で判定する", () => {
    expect(printEmploymentStart(worker, "org-b")).toBe("2026-09-05");
    expect(employmentStartInRange(worker, "org-b", "2026-09-01", "2026-09-30")).toBe(true);
    expect(employmentStartInRange(worker, "org-b", "2026-07-01", "2026-07-31")).toBe(false);
  });
  it("機関別の記録がなければ外国人情報の雇用開始年月日を使う", () => {
    expect(printEmploymentStart(worker, "org-a")).toBe("2026-07-13");
    expect(employmentStartInRange(worker, "org-a", "2026-07-01", "2026-07-31")).toBe(true);
    expect(employmentStartInRange(worker, "", "2026-07-01", "2026-07-31")).toBe(true);
  });
  it("雇用開始日が未登録なら含めない。期間が空なら制限しない", () => {
    expect(
      employmentStartInRange({ employment_start_on: null, org_employment_starts: [] }, "", "", ""),
    ).toBe(false);
    expect(employmentStartInRange(worker, "", "", "")).toBe(true);
  });
});

describe("employmentStartPrintUrl", () => {
  it("対象の年月の初日〜末日で雇用開始日の絞り込みをするURLを作る", () => {
    expect(employmentStartPrintUrl("org-1", "2026-09", "list")).toBe(
      "/workers/print?org=org-1&from=2026-09-01&to=2026-09-30&date=employment&mode=list",
    );
    expect(employmentStartPrintUrl("org-1", "2026-02", "sheets")).toBe(
      "/workers/print?org=org-1&from=2026-02-01&to=2026-02-28&date=employment&mode=internal",
    );
  });
});
