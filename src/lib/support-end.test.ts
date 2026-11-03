import { describe, expect, it } from "vitest";
import {
  SUPPORT_END_DEFAULT_MAJOR,
  SUPPORT_END_DEFAULT_MINOR,
  SUPPORT_END_DEFAULT_OTHER_REASON,
  SUPPORT_END_MAJOR_REASONS,
  SUPPORT_END_MINOR_REASONS,
  endDateFromPermitDate,
  isSupportEnd2goMigration,
  otherReasonTooLong,
  supportEndMajor,
  supportEndMinor,
} from "./support-end";

describe("endDateFromPermitDate", () => {
  it("支援委託の終了年月日は特定技能2号の許可日の前の日", () => {
    expect(endDateFromPermitDate("2026-09-10")).toBe("2026-09-09");
  });

  it("月初・年初でも前の月・前の年に正しく戻る", () => {
    expect(endDateFromPermitDate("2026-09-01")).toBe("2026-08-31");
    expect(endDateFromPermitDate("2026-01-01")).toBe("2025-12-31");
    expect(endDateFromPermitDate("2028-03-01")).toBe("2028-02-29"); // うるう年
  });

  it("許可日が空・形式違いなら空（届出書はまだ作れない）", () => {
    expect(endDateFromPermitDate("")).toBe("");
    expect(endDateFromPermitDate(null)).toBe("");
    expect(endDateFromPermitDate("2026/09/10")).toBe("");
  });
});

describe("終了の事由", () => {
  it("特定技能2号へ移行したときの既定は「委託契約の期間満了」＋「その他」", () => {
    expect(supportEndMajor(SUPPORT_END_DEFAULT_MAJOR)?.label).toBe("委託契約の期間満了");
    expect(SUPPORT_END_DEFAULT_MINOR).toBe("その他");
    expect(SUPPORT_END_DEFAULT_OTHER_REASON).toBe("特定技能２号へ移行した為");
  });

  it("チェック欄のセルは重複しない（同じマスに2つ書き込まない）", () => {
    const cells = [
      ...SUPPORT_END_MAJOR_REASONS.map((r) => r.cell),
      ...SUPPORT_END_MINOR_REASONS.map((r) => r.cell),
    ];
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("小分類は記載要領の対応表どおりに大分類と結びついている", () => {
    expect(supportEndMinor("期間満了")?.majors).toEqual(["期間満了"]);
    expect(supportEndMinor("登録取消し")?.majors).toEqual(["支援機関都合"]);
    // その他はどの大分類でも選べる
    expect(supportEndMinor("その他")?.majors).toEqual([]);
  });
});

describe("isSupportEnd2goMigration", () => {
  it("2号の許可日が入っていれば移行とみなす", () => {
    expect(
      isSupportEnd2goMigration({ permit_date_2go: "2026-10-26", minor_reason: "期間満了", other_reason: "" }),
    ).toBe(true);
  });

  it("許可日が無くても「その他」の理由に2号・移行があれば移行とみなす（全角半角の揺れもそろえる）", () => {
    expect(
      isSupportEnd2goMigration({
        permit_date_2go: null,
        minor_reason: SUPPORT_END_DEFAULT_MINOR,
        other_reason: SUPPORT_END_DEFAULT_OTHER_REASON,
      }),
    ).toBe(true);
    expect(
      isSupportEnd2goMigration({ permit_date_2go: "", minor_reason: "その他", other_reason: "特定技能2号に移行" }),
    ).toBe(true);
  });

  it("移行でない終わり方（経営上の都合など）は移行とみなさない", () => {
    expect(
      isSupportEnd2goMigration({ permit_date_2go: null, minor_reason: "経営上の都合", other_reason: "" }),
    ).toBe(false);
    expect(
      isSupportEnd2goMigration({ permit_date_2go: "", minor_reason: "その他", other_reason: "帰国する為" }),
    ).toBe(false);
  });
});

describe("otherReasonTooLong", () => {
  it("その他の理由は20文字以内", () => {
    expect(otherReasonTooLong("特定技能２号へ移行した為")).toBe(false);
    expect(otherReasonTooLong("あ".repeat(20))).toBe(false);
    expect(otherReasonTooLong("あ".repeat(21))).toBe(true);
  });
});
