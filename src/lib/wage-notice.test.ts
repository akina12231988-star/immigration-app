import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  belowNewMinimum,
  currentWageCell,
  defaultWageNoticeValues,
  monthDayText,
  pickWageNoticeWorkers,
  wageNoticeFileName,
  wageNoticeTargetText,
  warekiDateWithDow,
  yenText,
} from "./wage-notice";

describe("最低賃金の案内文", () => {
  it("初期値: 熊本県・令和8年12月1日から1,092円。返信期限は印刷日の2週間後", () => {
    const v = defaultWageNoticeValues("2026-10-05", "野口明菜", "050-8890-4000");
    expect(v.prefecture).toBe("熊本県");
    expect(v.hourly).toBe("1092");
    expect(v.effectiveOn).toBe("2026-12-01");
    expect(v.replyBy).toBe("2026-10-19");
    expect(v.sentOn).toBe("2026-10-05");
    expect(v.staff).toBe("野口明菜");
    expect(v.fax).toBe("050-8890-4000");
  });

  it("日付の表記", () => {
    expect(addDaysYmd("2026-10-25", 14)).toBe("2026-11-08");
    expect(warekiDateWithDow("2026-12-01")).toBe("令和8年12月1日（火）");
    expect(warekiDateWithDow("2026-10-31")).toBe("令和8年10月31日（土）");
    expect(monthDayText("2026-12-01")).toBe("12月1日");
    expect(warekiDateWithDow("")).toBe("");
  });

  it("金額と現在の時給の欄", () => {
    expect(yenText(1092)).toBe("1,092");
    expect(yenText("1,092")).toBe("1,092");
    expect(yenText("")).toBe("");
    expect(currentWageCell("時給", 1052)).toBe("1,052円");
    expect(currentWageCell("月給", 220000)).toBe("月給 220,000円");
    expect(currentWageCell(null, null)).toBe("");
    expect(currentWageCell("時給", 0)).toBe("");
  });

  it("改定後の最低賃金を下回る時給の人だけ印を付ける", () => {
    expect(belowNewMinimum("時給", 1052, 1092)).toBe(true);
    expect(belowNewMinimum("時給", 1100, 1092)).toBe(false);
    expect(belowNewMinimum("月給", 150000, 1092)).toBe(false);
    expect(belowNewMinimum(null, null, 1092)).toBe(false);
  });

  it("ファイル名", () => {
    expect(wageNoticeFileName("サンプル農園株式会社")).toBe("最低賃金の案内_サンプル農園株式会社");
    expect(wageNoticeFileName("")).toBe("最低賃金の案内");
  });

  it("名簿: 在籍中の後ろに、申請が審査中の人だけを「審査中」として足す", () => {
    const active = [{ id: "a", name: "在籍" }];
    const notYet = [
      { id: "b", name: "審査中" },
      { id: "c", name: "申請前" },
    ];
    const rows = pickWageNoticeWorkers(active, notYet, new Set(["b"]));
    expect(rows.map((r) => [r.id, r.underReview])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(pickWageNoticeWorkers(active, notYet, new Set())).toHaveLength(1);
  });

  it("本文: 審査中の人が入っていれば「在籍中・審査中」になる", () => {
    expect(wageNoticeTargetText([{ underReview: false }])).toBe("貴社に在籍中の特定技能外国人について");
    expect(wageNoticeTargetText([])).toBe("貴社に在籍中の特定技能外国人について");
    expect(wageNoticeTargetText([{ underReview: false }, { underReview: true }])).toBe(
      "貴社に在籍中・審査中の特定技能外国人について",
    );
  });
});
