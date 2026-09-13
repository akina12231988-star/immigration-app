import { describe, expect, it } from "vitest";
import { planDatesCardColumns, planDatesCardFileName } from "./plan-dates-card";

describe("planDatesCardColumns", () => {
  it("参考様式の枠を左右2列に分け、契約期間は自動で出す", () => {
    const [left, right] = planDatesCardColumns({ con: "2026-08-05", es: "2026-10-15", apply: "2026-09-15" });
    expect(left[0]).toEqual({ kind: "heading", label: "参考様式1-5号（雇用契約書）", value: "" });
    expect(left.find((l) => l.label === "雇用契約日")?.value).toBe("2026/8/5");
    expect(left.find((l) => l.label === "雇用契約期間")?.value).toBe("2026/10/15〜2028/10/14");
    expect(right[0].label).toBe("参考様式1-17号（支援計画書）");
    expect(right.find((l) => l.label === "支援委託契約日")?.value).toBe("2026/8/5");
    expect(right.find((l) => l.label === "契約期間（5年間）")?.value).toBe("2026/8/5〜2031/8/4");
    expect(right.find((l) => l.label === "申請予定日")?.value).toBe("2026/9/15");
    // 未登録の項目は空のまま
    expect(right.find((l) => l.label === "署名日")?.value).toBe("");
  });

  it("ファイル名は氏名と申請番号付き", () => {
    expect(planDatesCardFileName("NGUYEN VAN A", "TODO-2007")).toBe("NGUYEN VAN A_TODO-2007_支援計画書の日付.png");
  });
});
