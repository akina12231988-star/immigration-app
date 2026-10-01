import { describe, expect, it } from "vitest";
import {
  cleanWorkerSpouse,
  emptyWorkerSpouse,
  hasSpouseInfo,
  isLinkedSpouse,
  normalizeWorkerSpouse,
  spouseSummary,
} from "@/lib/worker-spouse";

describe("normalizeWorkerSpouse", () => {
  it("未登録（0175が未適用・空）のときは空の形で返す", () => {
    expect(normalizeWorkerSpouse(null)).toEqual(emptyWorkerSpouse());
    expect(normalizeWorkerSpouse({})).toEqual(emptyWorkerSpouse());
    expect(normalizeWorkerSpouse(undefined)).toEqual(emptyWorkerSpouse());
  });

  it("欠けている項目は空で埋める", () => {
    expect(normalizeWorkerSpouse({ name: "NGUYEN THI B", workplace: 123 })).toEqual({
      ...emptyWorkerSpouse(),
      name: "NGUYEN THI B",
    });
  });
});

describe("hasSpouseInfo / isLinkedSpouse", () => {
  it("1つでも記入があれば「入っている」", () => {
    expect(hasSpouseInfo(emptyWorkerSpouse())).toBe(false);
    expect(hasSpouseInfo({ ...emptyWorkerSpouse(), name: "A" })).toBe(true);
    expect(hasSpouseInfo({ ...emptyWorkerSpouse(), worker_id: "w2" })).toBe(true);
  });

  it("システムの外国人とリンクしているか", () => {
    expect(isLinkedSpouse({ ...emptyWorkerSpouse(), worker_id: "w2" })).toBe(true);
    expect(isLinkedSpouse({ ...emptyWorkerSpouse(), name: "A" })).toBe(false);
  });
});

describe("cleanWorkerSpouse", () => {
  it("リンクしているときは、氏名・生年月日・在留カード番号を持たない（相手の登録を見る）", () => {
    const out = cleanWorkerSpouse({
      worker_id: "w2",
      name: "手で入れた名前",
      birth: "1999-10-24",
      lives_together: "同居",
      residence_card_no: "AB12345678CD",
      workplace: "株式会社テスト",
    });
    expect(out).toEqual({
      worker_id: "w2",
      name: "",
      birth: "",
      lives_together: "同居",
      residence_card_no: "",
      workplace: "株式会社テスト",
    });
  });

  it("リンクしていないときは、入力した内容を前後の空白だけ落として残す", () => {
    const out = cleanWorkerSpouse({
      worker_id: "",
      name: " NGUYEN THI B ",
      birth: "1999-10-24",
      lives_together: "別居",
      residence_card_no: " AB12345678CD ",
      workplace: " 株式会社テスト ",
    });
    expect(out.name).toBe("NGUYEN THI B");
    expect(out.residence_card_no).toBe("AB12345678CD");
    expect(out.workplace).toBe("株式会社テスト");
    expect(out.lives_together).toBe("別居");
  });
});

describe("spouseSummary", () => {
  it("入力した内容を1行にまとめる", () => {
    expect(
      spouseSummary({
        worker_id: "",
        name: "NGUYEN THI B",
        birth: "1999-10-24",
        lives_together: "同居",
        residence_card_no: "AB12345678CD",
        workplace: "株式会社テスト",
      }),
    ).toBe("NGUYEN THI B ・ 生年月日 1999-10-24 ・ 同居 ・ 在留カード番号 AB12345678CD ・ 勤務先 株式会社テスト");
  });

  it("リンクしているときは、リンク先の外国人の登録を使う", () => {
    expect(
      spouseSummary(
        { ...emptyWorkerSpouse(), worker_id: "w2", lives_together: "同居" },
        { name: "LE THI HUONG", birth: "1999-10-24", residence_card_no: "C5681702" },
      ),
    ).toBe("LE THI HUONG ・ 生年月日 1999-10-24 ・ 同居 ・ 在留カード番号 C5681702");
  });
});
