import { describe, expect, it } from "vitest";
import { matchesApplicationTantou, tantouFilterOptions } from "./application-tantou";

const BASE = ["市原　彩奈", "田上　夏季", "大元　麗奈", "秋吉　伽恋", "野口　明菜"];

describe("matchesApplicationTantou", () => {
  it("「すべて」（空）のときは全部出す", () => {
    expect(matchesApplicationTantou("", "市原　彩奈")).toBe(true);
    expect(matchesApplicationTantou("　", null)).toBe(true);
  });

  it("一覧の担当者（申請準備）に一致すれば出す", () => {
    expect(matchesApplicationTantou("市原　彩奈", "市原　彩奈")).toBe(true);
  });

  it("空白の入れ方が違っても一致とみなす", () => {
    expect(matchesApplicationTantou("市原 彩奈", "市原　彩奈")).toBe(true);
    expect(matchesApplicationTantou("市原彩奈", "市原　彩奈")).toBe(true);
  });

  it("担当者が未設定の案件は、その人で絞ると出さない", () => {
    expect(matchesApplicationTantou("市原　彩奈", "")).toBe(false);
    expect(matchesApplicationTantou("市原　彩奈", null)).toBe(false);
    expect(matchesApplicationTantou("市原　彩奈", undefined)).toBe(false);
  });

  it("別の人の案件は出さない", () => {
    expect(matchesApplicationTantou("市原　彩奈", "田上　夏季")).toBe(false);
  });

  it("「未定」を選んだときは、担当者が「未定」の案件だけ出す", () => {
    expect(matchesApplicationTantou("未定", "未定")).toBe(true);
    expect(matchesApplicationTantou("未定", "市原　彩奈")).toBe(false);
  });
});

describe("tantouFilterOptions", () => {
  it("決まった顔ぶれをそのまま出す", () => {
    expect(tantouFilterOptions(BASE, [])).toEqual(BASE);
  });

  it("登録されている担当者が一覧に無ければ足す", () => {
    expect(tantouFilterOptions(BASE, ["VUONG VAN THANH"])).toEqual([...BASE, "VUONG VAN THANH"]);
  });

  it("同じ人は1回だけ（空白の入れ方が違っても足さない）", () => {
    expect(tantouFilterOptions(BASE, ["市原 彩奈", "市原　彩奈", "未定", "未定"])).toEqual([
      ...BASE,
      "未定",
    ]);
  });

  it("空欄は選択肢にしない", () => {
    expect(tantouFilterOptions(BASE, ["", "  ", null, undefined])).toEqual(BASE);
  });
});
