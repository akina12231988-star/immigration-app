import { describe, expect, it } from "vitest";
import {
  contractText,
  dailyWorkHours,
  deductionItemsText,
  emptyPostingSheet,
  hasPostingSheet,
  holidayText,
  insurancesText,
  normalizePostingSheet,
  normalizeTimeInput,
  postingSheetText,
  smokingText,
  workHoursText,
} from "./posting-sheet";

const POSTING = {
  job_type: "耕種農業",
  openings: 1,
  work_location: "熊本県八代市郡築十二番町29-2",
  wage_kind: "時給" as const,
  wage_amount: 1_050,
  contact: "0965-37-0826",
};

describe("normalizePostingSheet / hasPostingSheet", () => {
  it("未入力（{} や null）は既定値になる", () => {
    expect(normalizePostingSheet(null)).toEqual(emptyPostingSheet());
    expect(normalizePostingSheet({})).toEqual(emptyPostingSheet());
  });

  it("欠けている項目は既定値で埋める", () => {
    const s = normalizePostingSheet({ job_description: "いちごの収穫" });
    expect(s.job_description).toBe("いちごの収穫");
    expect(s.pay_method).toBe("口座振込");
    expect(s.holidays).toEqual([]);
  });

  it("手当は形をそろえて読み込む", () => {
    const s = normalizePostingSheet({ allowances: [{ name: "皆勤手当", amount: 5_000 }] });
    expect(s.allowances[0]).toEqual({ name: "皆勤手当", amount: "5000", method: "" });
  });

  it("休日・加入保険・控除項目は配列でなければ既定値にする", () => {
    const s = normalizePostingSheet({
      holidays: "土日",
      insurances: ["健康保険"],
      deduction_items: ["水道光熱費"],
    });
    expect(s.holidays).toEqual([]);
    expect(s.insurances).toEqual(["健康保険"]);
    expect(s.deduction_items).toEqual(["水道光熱費"]);
  });

  it("入力があるかどうかを判定できる", () => {
    expect(hasPostingSheet(null)).toBe(false);
    expect(hasPostingSheet({})).toBe(false);
    expect(hasPostingSheet({ field_name: "農業" })).toBe(true);
  });
});

describe("normalizeTimeInput", () => {
  it("数字だけの入力を時刻に直す", () => {
    expect(normalizeTimeInput("800")).toBe("8:00");
    expect(normalizeTimeInput("0830")).toBe("8:30");
    expect(normalizeTimeInput("1730")).toBe("17:30");
    expect(normalizeTimeInput("8")).toBe("8:00");
    expect(normalizeTimeInput("17")).toBe("17:00");
  });

  it("コロン付き・全角も整える", () => {
    expect(normalizeTimeInput("8:0")).toBe("8:00");
    expect(normalizeTimeInput("08:30")).toBe("8:30");
    expect(normalizeTimeInput("８：００")).toBe("8:00");
  });

  it("時刻と読めないものはそのまま返す", () => {
    expect(normalizeTimeInput("")).toBe("");
    expect(normalizeTimeInput("朝8時")).toBe("朝8時");
    expect(normalizeTimeInput("870")).toBe("870");
    expect(normalizeTimeInput("9999")).toBe("9999");
  });
});

describe("dailyWorkHours", () => {
  it("始業・終業・休憩から1日の所定労働時間を出す", () => {
    expect(dailyWorkHours("8:00", "17:00", "60")).toBe("8時間");
    expect(dailyWorkHours("8:00", "16:30", "60")).toBe("7時間30分");
    expect(dailyWorkHours("800", "1700", "")).toBe("9時間");
  });

  it("夜勤（日またぎ）も計算できる", () => {
    expect(dailyWorkHours("22:00", "7:00", "60")).toBe("8時間");
  });

  it("計算できないときは空", () => {
    expect(dailyWorkHours("", "17:00", "60")).toBe("");
    expect(dailyWorkHours("8:00", "", "60")).toBe("");
    expect(dailyWorkHours("9:00", "9:00", "0")).toBe("");
  });
});

describe("表示の組み立て", () => {
  it("休日は曜日とその他をまとめる", () => {
    const s = { ...emptyPostingSheet(), holidays: ["土", "日"], holiday_note: "年間休日105日" };
    expect(holidayText(s)).toBe("土・日 ／ 年間休日105日");
  });

  it("勤務時間は始業〜終業と所定労働時間", () => {
    const s = {
      ...emptyPostingSheet(),
      work_start: "8:00",
      work_end: "17:00",
      daily_hours: "8時間",
    };
    expect(workHoursText(s)).toBe("8:00〜17:00（1日の所定労働時間 8時間）");
  });

  it("勤務時間が未入力なら空", () => {
    expect(workHoursText(emptyPostingSheet())).toBe("");
  });

  it("契約期間は定めの有無・期間・更新をまとめる", () => {
    const s = {
      ...emptyPostingSheet(),
      contract_term_kind: "期間の定めあり",
      contract_term: "1年",
      contract_renewal: "有：勤務成績により判断",
    };
    expect(contractText(s)).toBe("期間の定めあり：1年 ／ 契約の更新：有：勤務成績により判断");
  });

  it("控除項目を並べる", () => {
    const s = {
      ...emptyPostingSheet(),
      deduction_items: ["水道光熱費", "社宅（居住費）", "雇用保険料"],
    };
    expect(deductionItemsText(s)).toBe("水道光熱費・社宅（居住費）・雇用保険料");
  });

  it("加入保険はその他も並べる", () => {
    const s = {
      ...emptyPostingSheet(),
      insurances: ["健康保険", "厚生年金保険"],
      insurance_other: "財形",
    };
    expect(insurancesText(s)).toBe("健康保険・厚生年金保険・財形");
  });

  it("受動喫煙防止措置は「その他」なら補足を出す", () => {
    expect(smokingText({ ...emptyPostingSheet(), smoking: "その他", smoking_note: "屋外のみ喫煙可" })).toBe(
      "屋外のみ喫煙可",
    );
    expect(smokingText({ ...emptyPostingSheet(), smoking: "屋内禁煙" })).toBe("屋内禁煙");
  });
});

describe("postingSheetText", () => {
  it("求人票の内容を貼り付けられる形にする", () => {
    const sheet = {
      ...emptyPostingSheet(),
      field_name: "農業",
      job_description: "いちごの収穫・選別",
      work_start: "8:00",
      work_end: "17:00",
      daily_hours: "8時間",
      break_minutes: "60",
      overtime: "有",
      holidays: ["日"],
      allowances: [{ name: "皆勤手当", amount: "5000", method: "欠勤がない月に定額支給" }],
      housing_cost: "20000",
      housing_kind: "賃貸物件",
      pay_closing_day: "末日",
      pay_day: "翌月25日",
      insurances: ["健康保険", "厚生年金保険"],
      deduction_items: ["水道光熱費", "雇用保険料"],
      requirements: "N4",
    };
    const text = postingSheetText(POSTING, sheet, "岩下みちる");

    expect(text).toContain("【求人票（特定技能1号）】");
    expect(text).toContain("求人者名（会社名）：岩下みちる");
    expect(text).toContain("分野名：農業");
    expect(text).toContain("職種：耕種農業");
    expect(text).toContain("採用人数：1名");
    expect(text).toContain("仕事内容：いちごの収穫・選別");
    expect(text).toContain("勤務時間：8:00〜17:00（1日の所定労働時間 8時間）");
    expect(text).toContain("休憩：60分");
    expect(text).toContain("手当：皆勤手当 5000円／計算方法：欠勤がない月に定額支給");
    expect(text).toContain("居住費：20000円／賃貸物件");
    expect(text).toContain("控除項目：水道光熱費・雇用保険料");
    expect(text).toContain("加入保険：健康保険・厚生年金保険");
    expect(text).toContain("必要条件：N4");
    // 見出しの前は1行あける
    expect(text).toContain("\n\n■ 給与");
  });

  it("未入力の項目は出さない", () => {
    const text = postingSheetText(POSTING, emptyPostingSheet());
    expect(text).not.toContain("仕事内容");
    expect(text).not.toContain("必要条件");
    expect(text).toContain("職種：耕種農業");
  });

  it("源泉所得税・通信費は数字なら円、なし・無しはそのまま出す", () => {
    const withNumbers = postingSheetText(POSTING, {
      ...emptyPostingSheet(),
      income_tax: "3000",
      communication_cost: "3000",
      fixed_overtime: "20000",
    });
    expect(withNumbers).toContain("源泉所得税（扶養0人として）：3000円");
    expect(withNumbers).toContain("通信費：約3000円");
    expect(withNumbers).toContain("固定残業代：月額20000円");

    const withText = postingSheetText(POSTING, {
      ...emptyPostingSheet(),
      income_tax: "なし",
      communication_cost: "無し",
    });
    expect(withText).toContain("源泉所得税（扶養0人として）：なし");
    expect(withText).toContain("通信費：無し");
  });
});
