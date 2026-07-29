import { describe, expect, it } from "vitest";
import {
  FINANCIAL_DEFAULT_ROWS,
  emptyOrganizationIntake,
  formatYen,
  normalizeOrganizationIntake,
  ownedMonthlyRent,
  parseAmount,
  perResidentCost,
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

describe("宿泊物件の費用計算", () => {
  it("金額文字列からカンマ・円・全角数字を除いて数値化する", () => {
    expect(parseAmount("15,000,000円")).toBe(15000000);
    expect(parseAmount("６０，０００")).toBe(60000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("なし")).toBeNull();
  });
  it("自己所有物件の1ヶ月分の家賃代 = （総費用＋備品代）÷（耐用年数×12）", () => {
    // (15,000,000 + 500,000) ÷ (22年×12) = 58,712円
    expect(ownedMonthlyRent("15,000,000", "500,000", "22")).toBe(58712);
    // 備品代なしでも計算できる
    expect(ownedMonthlyRent("13,200,000", "", "22")).toBe(50000);
    // 総費用か耐用年数が無ければ null
    expect(ownedMonthlyRent("", "500,000", "22")).toBeNull();
    expect(ownedMonthlyRent("15,000,000", "", "")).toBeNull();
  });
  it("1人あたりの居住費用 = 家賃 ÷ 最大入居人数", () => {
    expect(perResidentCost("60,000", "3")).toBe(20000);
    expect(perResidentCost("50,000", "3")).toBe(16667);
    expect(perResidentCost("", "3")).toBeNull();
    expect(perResidentCost("60,000", "")).toBeNull();
  });
  it("金額表示はカンマ区切り＋円", () => {
    expect(formatYen(58712)).toBe("58,712円");
  });
});
