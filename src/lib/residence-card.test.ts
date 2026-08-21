import { describe, expect, it } from "vitest";
import {
  emptyResidenceCardInput,
  isValidResidenceCardNo,
  normalizeCardDate,
  normalizeResidenceCardNo,
  residenceCardToWorkerFields,
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
    workRestriction: "在留資格に基づく就労活動のみ可",
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
      work_restriction: "在留資格に基づく就労活動のみ可",
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
