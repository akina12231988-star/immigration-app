import { describe, expect, it } from "vitest";
import {
  attachesFuyokojo,
  isPaperHandover,
  onboardingIndexFileName,
  onboardingIndexItems,
} from "./onboarding-index";

const TODAY = "2026-09-07"; // 令和8年

describe("isPaperHandover", () => {
  it("「紙で資料を渡す」のときだけ true", () => {
    expect(isPaperHandover("紙で資料を渡す")).toBe(true);
    expect(isPaperHandover("mailで資料を送る")).toBe(false);
    expect(isPaperHandover("")).toBe(false);
    expect(isPaperHandover(null)).toBe(false);
  });
});

describe("attachesFuyokojo（扶養控除等申告書を渡す会社）", () => {
  it("有限会社國崎青果と BASE株式会社だけ", () => {
    expect(attachesFuyokojo("有限会社國崎青果")).toBe(true);
    expect(attachesFuyokojo("BASE株式会社")).toBe(true);
    expect(attachesFuyokojo("株式会社ベース")).toBe(false);
    expect(attachesFuyokojo("片山　大輔")).toBe(false);
    expect(attachesFuyokojo("")).toBe(false);
  });

  it("法人格の書き方・異体字・全角半角の違いは同じ扱い", () => {
    expect(attachesFuyokojo("國崎青果有限会社")).toBe(true);
    expect(attachesFuyokojo("有限会社国崎青果")).toBe(true);
    expect(attachesFuyokojo("株式会社BASE")).toBe(true);
    expect(attachesFuyokojo("ＢＡＳＥ株式会社")).toBe(true);
  });
});

describe("onboardingIndexItems", () => {
  it("入社書類メールの並びで、扶養控除等申告書は対象の会社だけ入れる", () => {
    const base = onboardingIndexItems({
      today: TODAY,
      orgName: "株式会社さくら",
      payMethod: "口座振込",
      koyoCovered: "はい",
    });
    expect(base.map((r) => r.label)).toEqual([
      "在留カード",
      "指定書",
      "申請書類一式（雇用契約書・雇用条件書含む）",
      "マイナンバー",
      "通帳の見開き",
      "扶養証明書（日本語翻訳）",
      "労働者名簿",
      "履歴書",
      "令和8年分源泉徴収票",
      "フリガナがわかる書類（前職の社保など）",
    ]);
    expect(base.map((r) => r.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const kunisaki = onboardingIndexItems({
      today: TODAY,
      orgName: "有限会社國崎青果",
      payMethod: "口座振込",
      koyoCovered: "はい",
    });
    expect(kunisaki.map((r) => r.label)).toContain("扶養控除等申告書");
    expect(kunisaki[6].label).toBe("扶養控除等申告書"); // 扶養証明書の次
  });

  it("雇用保険の適用事業所でない会社は外国人雇用状況届出書、通貨払いは報酬支払証明書を足す", () => {
    const rows = onboardingIndexItems({
      today: TODAY,
      orgName: "株式会社さくら",
      payMethod: "通貨払い",
      koyoCovered: "いいえ",
    });
    const last2 = rows.slice(-2);
    expect(last2.map((r) => r.label)).toEqual([
      "外国人雇用状況届出書（様式第3号）",
      "報酬支払証明書（参考様式第５－７号）",
    ]);
    expect(last2[0].note).toContain("雇用保険");
    expect(last2[1].note).toContain("通貨払い");
    expect(rows[rows.length - 1].num).toBe(rows.length);
  });
});

describe("onboardingIndexFileName", () => {
  it("氏名を付ける", () => {
    expect(onboardingIndexFileName("VU THI NHAN")).toBe("入社書類目次_VU THI NHAN");
    expect(onboardingIndexFileName("")).toBe("入社書類目次");
  });
});
