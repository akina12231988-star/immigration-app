import { describe, expect, it } from "vitest";
import {
  FINANCIAL_YEAR_LABELS,
  emptyOrganizationIntake,
  normalizeOrganizationIntake,
} from "./organization-intake";

describe("normalizeOrganizationIntake", () => {
  it("空のjsonb（{}）から全キーを補完する", () => {
    const intake = normalizeOrganizationIntake({});
    expect(intake).toEqual(emptyOrganizationIntake());
    expect(intake.financials).toHaveLength(FINANCIAL_YEAR_LABELS.length);
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
    // 決算情報は3行に補完され、1行目の入力は保持される
    expect(intake.financials).toHaveLength(3);
    expect(intake.financials[0]).toEqual({
      year: "6",
      sales: "1000万円",
      ordinary: "",
      net: "",
      assets: "",
    });
    expect(intake.financials[1].sales).toBe("");
    // 役員行は欠けたキーが補完される
    expect(intake.officers).toEqual([
      { kana: "", name: "山田 太郎", title: "", not_involved: true },
    ]);
  });
});
