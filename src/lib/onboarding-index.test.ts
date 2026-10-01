import { describe, expect, it } from "vitest";
import {
  addIndexItem,
  attachesFuyokojo,
  isPaperHandover,
  moveIndexItem,
  onboardingIndexFileName,
  onboardingIndexItems,
  removeIndexItem,
  updateIndexItem,
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

describe("目次の行の足し引き", () => {
  const base = onboardingIndexItems({ today: TODAY, orgName: "株式会社さくら", payMethod: "口座振込", koyoCovered: "はい" });

  it("足すと末尾に空の行が付き、番号が続く。キーは重ならない", () => {
    const once = addIndexItem(base);
    expect(once).toHaveLength(base.length + 1);
    expect(once[once.length - 1]).toEqual({ key: "custom-1", num: base.length + 1, label: "", note: "" });
    const twice = addIndexItem(once, "健康診断書", "会社の指定");
    expect(twice[twice.length - 1]).toEqual({ key: "custom-2", num: base.length + 2, label: "健康診断書", note: "会社の指定" });
  });

  it("消すと番号を振り直す", () => {
    const rows = removeIndexItem(base, "mynumber");
    expect(rows.map((r) => r.label)).not.toContain("マイナンバー");
    expect(rows.map((r) => r.num)).toEqual(rows.map((_, i) => i + 1));
  });

  it("書類名・備考を書き換える", () => {
    const rows = updateIndexItem(base, "furigana", { note: "前職の社保のコピー" });
    expect(rows.find((r) => r.key === "furigana")!.note).toBe("前職の社保のコピー");
    expect(rows.find((r) => r.key === "furigana")!.label).toBe(base.find((r) => r.key === "furigana")!.label);
  });

  it("上下に動かす（端ではそのまま）", () => {
    const down = moveIndexItem(base, base[0].key, 1);
    expect(down[1].key).toBe(base[0].key);
    expect(down[0].num).toBe(1);
    expect(down[1].num).toBe(2);
    expect(moveIndexItem(base, base[0].key, -1)).toBe(base);
    expect(moveIndexItem(base, "nothing", 1)).toBe(base);
  });
});
