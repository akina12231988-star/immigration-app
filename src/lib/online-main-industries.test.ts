import { describe, expect, it } from "vitest";
import { ONLINE_MAIN_INDUSTRIES, suggestedMainIndustry } from "./online-main-industries";

describe("主たる業種（オンライン申請 3.4）", () => {
  it("画面のプルダウンと同じ 47 業種が重複なく並ぶ", () => {
    expect(ONLINE_MAIN_INDUSTRIES.length).toBe(47);
    expect(new Set(ONLINE_MAIN_INDUSTRIES).size).toBe(ONLINE_MAIN_INDUSTRIES.length);
    expect(ONLINE_MAIN_INDUSTRIES[0]).toBe("農林業");
    expect(ONLINE_MAIN_INDUSTRIES.at(-1)).toBe("分類不能の産業");
  });

  it("特定技能の分野から通常の業種を案内する", () => {
    expect(suggestedMainIndustry("農業")).toBe("農林業");
    expect(suggestedMainIndustry("農業／畜産農業全般")).toBe("農林業");
    expect(suggestedMainIndustry("介護分野")).toBe("社会保険・社会福祉・介護事業");
    expect(suggestedMainIndustry("造船・船用工業")).toBe("輸送用機械器具製造業");
    expect(suggestedMainIndustry("")).toBe("");
    expect(suggestedMainIndustry("工業製品製造業")).toBe("");
  });
});
