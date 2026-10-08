import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  belowNewMinimum,
  currentWageCell,
  defaultWageNoticeValues,
  monthDayText,
  pickWageNoticeWorkers,
  wageNoticeExcluded,
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

  it("名簿: 状態が「在籍中」でなくても、今月の請求書作成の名簿に載っている人は在籍中として載せ、状態を直す案内を付ける", () => {
    const active = [{ id: "a", name: "在籍", status: "在籍中" }];
    const notYet = [
      { id: "b", name: "請求あり", status: "申請準備中" },
      { id: "c", name: "審査中", status: "申請準備中" },
      { id: "d", name: "申請前", status: "申請準備中" },
    ];
    const rows = pickWageNoticeWorkers(active, notYet, new Set(["c"]), new Set(["b"]));
    expect(rows.map((r) => [r.id, r.underReview])).toEqual([
      ["a", false],
      ["b", false],
      ["c", true],
    ]);
    expect(rows[0].statusNote).toBeUndefined();
    expect(rows[1].statusNote).toMatch(/状態が「申請準備中」のまま/);
    expect(rows[2].statusNote).toBeUndefined();
  });

  it("名簿: 審査中でもあり請求書作成の名簿にも載っている人は、在籍中として1回だけ載せる", () => {
    const notYet = [{ id: "b", name: "両方", status: "申請準備中" }];
    const rows = pickWageNoticeWorkers([], notYet, new Set(["b"]), new Set(["b"]));
    expect(rows).toHaveLength(1);
    expect(rows[0].underReview).toBe(false);
  });

  it("載らない人と理由: 状態が在籍中でなく、審査中でもなく、請求書作成の名簿にもいない人", () => {
    const notYet = [
      { id: "b", name: "請求あり", status: "申請準備中" },
      { id: "c", name: "審査中", status: "申請準備中" },
      { id: "d", name: "申請前", status: "" },
    ];
    const excluded = wageNoticeExcluded(notYet, new Set(["c"]), new Set(["b"]));
    expect(excluded.map((e) => e.worker.id)).toEqual(["d"]);
    expect(excluded[0].reason).toMatch(/状態が「未設定」/);
  });

  it("本文: 審査中の人が入っていれば「在籍中・審査中」になる", () => {
    expect(wageNoticeTargetText([{ underReview: false }])).toBe("貴社に在籍中の特定技能外国人について");
    expect(wageNoticeTargetText([])).toBe("貴社に在籍中の特定技能外国人について");
    expect(wageNoticeTargetText([{ underReview: false }, { underReview: true }])).toBe(
      "貴社に在籍中・審査中の特定技能外国人について",
    );
  });
});
