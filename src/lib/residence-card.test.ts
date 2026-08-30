import { describe, expect, it } from "vitest";
import {
  cardFaceDate,
  emptyResidenceCardInput,
  isValidResidenceCardNo,
  normalizeCardDate,
  normalizeResidenceCardNo,
  residenceCardToWorkerFields,
  residencePeriodFromDates,
  workRestrictionLabel,
} from "./residence-card";

describe("normalizeCardDate", () => {
  it("西暦のいろいろな書き方を YYYY-MM-DD にそろえる", () => {
    expect(normalizeCardDate("2026-07-24")).toBe("2026-07-24");
    expect(normalizeCardDate("2026/7/24")).toBe("2026-07-24");
    expect(normalizeCardDate("2026.7.24")).toBe("2026-07-24");
    expect(normalizeCardDate("2026年7月24日")).toBe("2026-07-24");
  });

  it("元号の書き方も読む", () => {
    expect(normalizeCardDate("令和8年7月24日")).toBe("2026-07-24");
    expect(normalizeCardDate("令和元年5月1日")).toBe("2019-05-01");
    expect(normalizeCardDate("平成31年4月30日")).toBe("2019-04-30");
  });

  it("全角の数字でも読む", () => {
    expect(normalizeCardDate("２０２６年７月２４日")).toBe("2026-07-24");
  });

  it("読み取れない書き方は空にする（間違った日付を入れない）", () => {
    expect(normalizeCardDate("")).toBe("");
    expect(normalizeCardDate("未定")).toBe("");
    expect(normalizeCardDate("2026-13-01")).toBe("");
    expect(normalizeCardDate("26/7/24")).toBe("");
  });
});

describe("normalizeResidenceCardNo", () => {
  it("全角・小文字・空白・ハイフンをそろえる", () => {
    expect(normalizeResidenceCardNo("ab 1234 5678 cd")).toBe("AB12345678CD");
    expect(normalizeResidenceCardNo("ＡＢ１２３４５６７８ＣＤ")).toBe("AB12345678CD");
  });
});

describe("isValidResidenceCardNo", () => {
  it("英字2＋数字8＋英字2 なら正しい", () => {
    expect(isValidResidenceCardNo("AB12345678CD")).toBe(true);
    expect(isValidResidenceCardNo("ab12345678cd")).toBe(true);
  });

  it("桁数や並びが違えば正しくない", () => {
    expect(isValidResidenceCardNo("AB1234567CD")).toBe(false);
    expect(isValidResidenceCardNo("AB12345678C")).toBe(false);
    expect(isValidResidenceCardNo("A112345678CD")).toBe(false);
    expect(isValidResidenceCardNo("")).toBe(false);
  });
});

describe("residenceCardToWorkerFields", () => {
  const filled = {
    ...emptyResidenceCardInput(),
    name: "HOANG MINH TUNG",
    birth: "平成8年3月2日",
    gender: "男",
    nationality: "ベトナム",
    address: "熊本県玉名市松木1-2-3",
    residenceStatus: "特定技能1号",
    residencePeriod: "1年",
    expiryDate: "2027/5/8",
    permitDate: "令和8年5月8日",
    cardNo: "ab12345678cd",
  };

  it("フォームの項目名で、正規化した値を返す", () => {
    expect(residenceCardToWorkerFields(filled)).toEqual({
      name: "HOANG MINH TUNG",
      birth: "1996-03-02",
      gender: "男",
      nationality: "ベトナム",
      address: "熊本県玉名市松木1-2-3",
      residence_status: "特定技能1号",
      residence_period: "1年",
      residence_expiry_date: "2027-05-08",
      residence_permit_date: "2026-05-08",
      residence_card_no: "AB12345678CD",
    });
  });

  it("入れなかった項目は返さない（空で上書きしない）", () => {
    expect(residenceCardToWorkerFields(emptyResidenceCardInput())).toEqual({});
  });

  it("読み取れない日付は返さない", () => {
    const odd = { ...emptyResidenceCardInput(), expiryDate: "未定" };
    expect(residenceCardToWorkerFields(odd)).toEqual({});
  });
});

describe("cardFaceDate", () => {
  it("券面の書き方（YYYY年MM月DD日）にする", () => {
    expect(cardFaceDate("2028-08-24")).toBe("2028年08月24日");
  });

  it("YYYY-MM-DD 以外は空", () => {
    expect(cardFaceDate("")).toBe("");
    expect(cardFaceDate("2028/08/24")).toBe("");
  });
});

describe("workRestrictionLabel", () => {
  it("技能実習・特定技能は「在留資格に基づく就労活動のみ可」", () => {
    expect(workRestrictionLabel("技能実習1号")).toBe("在留資格に基づく就労活動のみ可");
    expect(workRestrictionLabel("特定技能1号")).toBe("在留資格に基づく就労活動のみ可");
    expect(workRestrictionLabel("特定技能2号")).toBe("在留資格に基づく就労活動のみ可");
  });

  it("特定活動は「指定書により指定された就労活動のみ可」", () => {
    expect(workRestrictionLabel("特定活動（特定技能1号以降準備）")).toBe(
      "指定書により指定された就労活動のみ可",
    );
  });

  it("全角の「１」でも判定できる", () => {
    expect(workRestrictionLabel("特定技能１号")).toBe("在留資格に基づく就労活動のみ可");
  });

  it("分からない在留資格・未設定は空", () => {
    expect(workRestrictionLabel("")).toBe("");
    expect(workRestrictionLabel("永住者")).toBe("");
  });
});

describe("residencePeriodFromDates", () => {
  it("変更・上陸許可: 満了日が許可日のちょうどNか月後なら、その期間", () => {
    expect(residencePeriodFromDates("2026-08-24", "2028-08-24")).toBe("2年");
    expect(residencePeriodFromDates("2025-12-24", "2026-06-24")).toBe("6月");
    expect(residencePeriodFromDates("2026-05-08", "2027-05-08")).toBe("1年");
    expect(residencePeriodFromDates("2026-01-15", "2026-05-15")).toBe("4月");
  });

  it("応当日が無い月は月末に丸めて判定する", () => {
    // 8/31 の6か月後は 2/28（29）
    expect(residencePeriodFromDates("2025-08-31", "2026-02-28")).toBe("6月");
  });

  it("1年を超える端数は「N年M月」", () => {
    expect(residencePeriodFromDates("2026-01-10", "2027-07-10")).toBe("1年6月");
  });

  it("更新許可: 前の満了日から数えた期間を推定する（許可日の前後3か月以内）", () => {
    // 8/24 満了のカードを 8/1 に更新許可 → 新しい満了日は前の満了日+1年
    expect(residencePeriodFromDates("2026-08-01", "2027-08-24")).toBe("1年");
    // 満了日を過ぎて特例期間中に許可が出た場合（許可日が前の満了日より後）
    expect(residencePeriodFromDates("2026-09-10", "2027-08-24")).toBe("1年");
  });

  it("日付の入れ違い・計算できない組み合わせは null", () => {
    expect(residencePeriodFromDates("2026-12-24", "2026-06-24")).toBe(null); // 満了日が許可日より前
    expect(residencePeriodFromDates("", "2026-06-24")).toBe(null);
    expect(residencePeriodFromDates("2026-06-24", "")).toBe(null);
    expect(residencePeriodFromDates("2026-01-01", "2026-01-20")).toBe(null); // 期間にならない
  });
});
