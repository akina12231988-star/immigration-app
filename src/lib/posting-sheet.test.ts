import { describe, expect, it } from "vitest";
import {
  contractText,
  emptyPostingSheet,
  hasPostingSheet,
  holidayText,
  insurancesText,
  normalizePostingSheet,
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

  it("休日・加入保険は配列でなければ既定値にする", () => {
    const s = normalizePostingSheet({ holidays: "土日", insurances: ["健康保険"] });
    expect(s.holidays).toEqual([]);
    expect(s.insurances).toEqual(["健康保険"]);
  });

  it("入力があるかどうかを判定できる", () => {
    expect(hasPostingSheet(null)).toBe(false);
    expect(hasPostingSheet({})).toBe(false);
    expect(hasPostingSheet({ field_name: "農業" })).toBe(true);
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
});
