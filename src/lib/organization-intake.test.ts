import { describe, expect, it } from "vitest";
import {
  FINANCIAL_DEFAULT_ROWS,
  emptyOrganizationIntake,
  normalizeOrganizationIntake,
} from "./organization-intake";

describe("normalizeOrganizationIntake", () => {
  it("空のjsonb（{}）から全キーを補完する", () => {
    const intake = normalizeOrganizationIntake({});
    expect(intake).toEqual(emptyOrganizationIntake());
    expect(intake.financials).toHaveLength(FINANCIAL_DEFAULT_ROWS);
    expect(intake.japanese_staff).toHaveLength(1);
    expect(intake.officers).toHaveLength(1);
  });

  it("null や不正値でも初期値になる", () => {
    expect(normalizeOrganizationIntake(null)).toEqual(emptyOrganizationIntake());
    expect(normalizeOrganizationIntake("x")).toEqual(emptyOrganizationIntake());
  });

  it("保存済みの値は保持し、欠けたキーだけ補完する", () => {
    const intake = normalizeOrganizationIntake({
      phone: "096-000-0000",
      financials: [{ year: "6", sales: "1000万円" }],
      officers: [{ name: "山田 太郎", not_involved: true }],
    });
    expect(intake.phone).toBe("096-000-0000");
    expect(intake.kana).toBe("");
    // 決算情報は保存済みの行数を維持し（行の追加に対応）、欠けたキーは補完される
    expect(intake.financials).toHaveLength(1);
    expect(intake.financials[0]).toEqual({
      year: "6",
      term: "",
      period_from: "",
      period_to: "",
      sales: "1000万円",
      ordinary: "",
      net: "",
      assets: "",
    });
    // 役員行は欠けたキーが補完される
    expect(intake.officers).toEqual([
      { kana: "", name: "山田 太郎", title: "", not_involved: true },
    ]);
  });
});
