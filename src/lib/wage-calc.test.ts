import { describe, expect, it } from "vitest";
import {
  allowanceMethodTemplate,
  constructionMinMonthly,
  calcIncomeTaxMonthly,
  calcWageDetail,
  emptyWageDetail,
  employmentInsuranceAmount,
  hasWageDetail,
  healthInsuranceRate,
  lodgingNoteTemplate,
  lodgingPerPerson,
  monthlyBaseWage,
  normalizeWageDetail,
  socialInsuranceAmount,
  wageDetailFormText,
} from "./wage-calc";

describe("monthlyBaseWage", () => {
  it("月給はそのまま", () => {
    expect(monthlyBaseWage("月給", 180_000, 2_080)).toBe(180_000);
  });

  it("時給は 時給×年間所定労働時間÷12", () => {
    expect(monthlyBaseWage("時給", 1_050, 2_070)).toBe(Math.round((1_050 * 2_070) / 12));
  });

  it("日給は1日8時間として月平均所定労働日数で換算", () => {
    expect(monthlyBaseWage("日給", 9_000, 2_080)).toBe(Math.round((9_000 * (2_080 / 12)) / 8));
  });

  it("年収は12で割る", () => {
    expect(monthlyBaseWage("年収", 2_400_000, 2_080)).toBe(200_000);
  });

  it("年間所定労働時間が未登録なら時給・日給は計算しない", () => {
    expect(monthlyBaseWage("時給", 1_050, 0)).toBe(0);
    expect(monthlyBaseWage("日給", 9_000, 0)).toBe(0);
  });
});

describe("calcIncomeTaxMonthly", () => {
  // 計算ツール（令和8年分 月額表 甲欄・電算機計算の特例）と同じ値になること
  it("扶養なしの一般的な額", () => {
    expect(calcIncomeTaxMonthly(153_351, false, 0)).toBe(2_600);
  });

  it("源泉控除対象配偶者がいると安くなる", () => {
    expect(calcIncomeTaxMonthly(153_351, true, 0)).toBeLessThan(
      calcIncomeTaxMonthly(153_351, false, 0),
    );
  });

  it("扶養親族が増えるほど安くなる", () => {
    expect(calcIncomeTaxMonthly(200_000, false, 2)).toBeLessThan(
      calcIncomeTaxMonthly(200_000, false, 0),
    );
  });

  it("控除しきると0円（マイナスにならない）", () => {
    expect(calcIncomeTaxMonthly(80_000, false, 0)).toBe(0);
    expect(calcIncomeTaxMonthly(-100, false, 0)).toBe(0);
  });

  it("10円未満は四捨五入する", () => {
    expect(calcIncomeTaxMonthly(153_351, false, 0) % 10).toBe(0);
  });
});

describe("socialInsuranceAmount", () => {
  it("熊本・40歳未満は（健保10.08＋こども子育て0.23＋厚生年金18.3）の半分", () => {
    expect(
      socialInsuranceAmount(180_000, { enabled: true, healthRate: 10.08, ageBand: "40歳未満" }),
    ).toBe(Math.round((180_000 * (10.08 + 0.23 + 18.3)) / 2 / 100));
  });

  it("40〜64歳は介護保険料が乗って高くなる", () => {
    const under = socialInsuranceAmount(180_000, {
      enabled: true,
      healthRate: 10.08,
      ageBand: "40歳未満",
    });
    const over = socialInsuranceAmount(180_000, {
      enabled: true,
      healthRate: 10.08,
      ageBand: "40〜64歳",
    });
    expect(over).toBeGreaterThan(under);
  });

  it("65歳以上は介護保険料が乗らない", () => {
    expect(
      socialInsuranceAmount(180_000, { enabled: true, healthRate: 10.08, ageBand: "65歳以上" }),
    ).toBe(
      socialInsuranceAmount(180_000, { enabled: true, healthRate: 10.08, ageBand: "40歳未満" }),
    );
  });

  it("加入しない場合は0円", () => {
    expect(
      socialInsuranceAmount(180_000, { enabled: false, healthRate: 10.08, ageBand: "40歳未満" }),
    ).toBe(0);
  });
});

describe("employmentInsuranceAmount", () => {
  it("一般の事業は0.5%", () => {
    expect(employmentInsuranceAmount(180_000, { enabled: true, kind: "一般の事業" })).toBe(900);
  });

  it("建設の事業は0.6%", () => {
    expect(employmentInsuranceAmount(180_000, { enabled: true, kind: "建設の事業" })).toBe(1_080);
  });

  it("加入しない場合は0円", () => {
    expect(employmentInsuranceAmount(180_000, { enabled: false, kind: "一般の事業" })).toBe(0);
  });
});

describe("healthInsuranceRate", () => {
  it("都道府県を選べばその率", () => {
    expect(healthInsuranceRate("熊本", 0)).toBe(10.08);
  });

  it("手入力なら入力した率をそのまま使う", () => {
    expect(healthInsuranceRate("手入力", 9.55)).toBe(9.55);
  });
});

describe("constructionMinMonthly", () => {
  it("建設分野の基準額 = 全国平均最低賃金×1.1×年間所定労働時間÷12（切り上げ）", () => {
    // 1121円 × 1.1 × 2080h ÷ 12 = 213,737.33… → 213,738円
    expect(constructionMinMonthly(2080)).toBe(213_738);
  });
});

describe("lodgingPerPerson", () => {
  it("家賃（1人あたりで登録）をそのまま使う", () => {
    expect(lodgingPerPerson({ rent: "20000", max_residents: "3" })).toBe(20_000);
  });

  it("「20,000円」のような書き方でも読み取る", () => {
    expect(lodgingPerPerson({ rent: "20,000円", max_residents: "3人" })).toBe(20_000);
  });

  it("家賃が未入力なら0", () => {
    expect(lodgingPerPerson({ rent: "", max_residents: "3" })).toBe(0);
  });
});

describe("lodgingNoteTemplate", () => {
  it("人数が分かれば按分の根拠を書いた文になる", () => {
    const text = lodgingNoteTemplate(
      { name: "女子寮", rent: "20000", max_residents: "3" },
      20_000,
    );
    expect(text).toContain("女子寮");
    expect(text).toContain("3名");
    expect(text).toContain("20,000円");
    expect(text).toContain("賃貸借契約書");
  });
});

describe("allowanceMethodTemplate", () => {
  it("種類に応じた計算方法の文例が出る", () => {
    expect(allowanceMethodTemplate("通勤手当", 5_000)).toContain("実費交通費");
    expect(allowanceMethodTemplate("通勤手当", 5_000)).toContain("5,000円");
  });
});

describe("normalizeWageDetail / hasWageDetail", () => {
  it("未入力（{} や null）は既定値になる", () => {
    expect(normalizeWageDetail(null)).toEqual(emptyWageDetail());
    expect(normalizeWageDetail({})).toEqual(emptyWageDetail());
  });

  it("欠けている項目は既定値で埋める", () => {
    const d = normalizeWageDetail({ food_cost: 10_000 });
    expect(d.food_cost).toBe(10_000);
    expect(d.health_prefecture).toBe("熊本");
    expect(d.allowances).toEqual([]);
  });

  it("諸手当・その他控除は形をそろえて読み込む", () => {
    const d = normalizeWageDetail({
      allowances: [{ type: "通勤手当", amount: "5000" }],
      others: [{ name: "備品代", amount: 1_000 }],
    });
    expect(d.allowances[0]).toEqual({ type: "通勤手当", name: "", amount: 5_000, method: "" });
    expect(d.others[0]).toEqual({ name: "備品代", amount: 1_000 });
  });

  it("入力があるかどうかを判定できる", () => {
    expect(hasWageDetail(null)).toBe(false);
    expect(hasWageDetail({})).toBe(false);
    expect(hasWageDetail({ food_cost: 0 })).toBe(true);
  });
});

describe("calcWageDetail", () => {
  const detail = {
    ...emptyWageDetail(),
    annual_hours: 2_080,
    allowances: [{ type: "通勤手当", name: "", amount: 5_000, method: "実費" }],
    food_cost: 10_000,
    housing_amount: 20_000,
    utility_amount: 8_000,
    others: [{ name: "備品代", amount: 1_000 }],
  };

  it("支払概算額は 基本賃金＋諸手当", () => {
    const r = calcWageDetail({ kind: "月給", amount: 180_000 }, detail);
    expect(r.base).toBe(180_000);
    expect(r.allowanceTotal).toBe(5_000);
    expect(r.gross).toBe(185_000);
  });

  it("控除の合計と手取りが合う", () => {
    const r = calcWageDetail({ kind: "月給", amount: 180_000 }, detail);
    expect(r.deductTotal).toBe(
      r.tax + r.social + r.employment + r.food + r.housing + r.utility + r.otherTotal,
    );
    expect(r.net).toBe(r.gross - r.deductTotal);
  });

  it("固定残業代は諸手当に含める", () => {
    const r = calcWageDetail(
      { kind: "月給", amount: 180_000 },
      { ...detail, fixed_ot_enabled: true, fixed_ot_amount: 30_000 },
    );
    expect(r.allowanceTotal).toBe(35_000);
    expect(r.gross).toBe(215_000);
  });

  it("本人が自分で契約する場合は居住費0円", () => {
    const r = calcWageDetail(
      { kind: "月給", amount: 180_000 },
      { ...detail, housing_self_contract: true },
    );
    expect(r.housing).toBe(0);
  });

  it("年間所定労働時間は別紙の値がなければ所属機関の値を使う", () => {
    const r = calcWageDetail(
      { kind: "時給", amount: 1_050 },
      { ...detail, annual_hours: 0 },
      2_070,
    );
    expect(r.annualHours).toBe(2_070);
    expect(r.base).toBe(Math.round((1_050 * 2_070) / 12));
  });

  it("計算ツールと同じ額になる（月給180,000円・熊本・一般の事業）", () => {
    const r = calcWageDetail({ kind: "月給", amount: 180_000 }, emptyWageDetail());
    expect(r.gross).toBe(180_000);
    expect(r.social).toBe(25_749);
    expect(r.employment).toBe(900);
    expect(r.tax).toBe(2_600);
    expect(r.net).toBe(180_000 - (25_749 + 900 + 2_600));
  });
});

describe("wageDetailFormText", () => {
  it("様式に貼り付けられる形で出る", () => {
    const detail = {
      ...emptyWageDetail(),
      annual_hours: 2_080,
      allowances: [{ type: "通勤手当", name: "", amount: 5_000, method: "実費交通費として支給する。" }],
      housing_amount: 20_000,
      housing_note: "家賃60,000円を3名で按分",
      others: [{ name: "備品代", amount: 1_000 }],
    };
    const wage = { kind: "月給" as const, amount: 180_000 };
    const text = wageDetailFormText(wage, detail, calcWageDetail(wage, detail));
    expect(text).toContain("【賃金の支払】");
    expect(text).toContain("１．基本賃金：月給（180,000円）");
    expect(text).toContain("(a) 通勤手当 5,000円／計算方法：実費交通費として支給する。");
    expect(text).toContain("(e) 居　住　費　　　（約20,000円）");
    expect(text).toContain("家賃60,000円を3名で按分");
    expect(text).toContain("（備品代）（約1,000円）");
    expect(text).toContain("５．手取り支給額");
  });
});
