import { describe, expect, it } from "vitest";
import { normalizeKana, sealBadgeText, sealMatchesKana, sealsForWorker, sortSeals, type SealRow } from "./seals";

const seal = (patch: Partial<SealRow>): SealRow => ({
  id: "s",
  kana: "グエン",
  note: "",
  made_on: null,
  transferred_on: null,
  transferred_to: null,
  created_at: "",
  updated_at: "",
  ...patch,
});

describe("normalizeKana / sealMatchesKana", () => {
  it("空白・全角半角・ひらがなカタカナの違いを無視して一部一致で見る", () => {
    expect(normalizeKana("ぐえん　ヴァン")).toBe("グエンヴァン");
    expect(normalizeKana("ｸﾞｴﾝ")).toBe("グエン");
    expect(sealMatchesKana("グエン", "グエン　ヴァン　アン")).toBe(true);
    expect(sealMatchesKana("グエン", "レ グエン")).toBe(true);
    expect(sealMatchesKana("ぐえん", "グエン")).toBe(true);
    expect(sealMatchesKana("チャン", "グエン　ヴァン　アン")).toBe(false);
    expect(sealMatchesKana("", "グエン")).toBe(false);
    expect(sealMatchesKana("グエン", "")).toBe(false);
  });
});

describe("sealsForWorker / sealBadgeText", () => {
  it("箱の中で当てはまる印鑑だけ。譲渡済みは出さない", () => {
    const list = [
      seal({ id: "a", kana: "グエン" }),
      seal({ id: "b", kana: "グエン", transferred_on: "2026-09-01" }),
      seal({ id: "c", kana: "アン" }),
      seal({ id: "d", kana: "チャン" }),
    ];
    const hit = sealsForWorker(list, "グエン　ヴァン　アン");
    expect(hit.map((s) => s.id)).toEqual(["a", "c"]);
    expect(sealBadgeText(hit)).toBe("印鑑あり「グエン」「アン」");
    expect(sealBadgeText([])).toBe("");
  });
});

describe("sortSeals", () => {
  it("箱の中をフリガナ順で先に、譲渡済みは譲渡日の新しい順", () => {
    const list = [
      seal({ id: "t1", kana: "ア", transferred_on: "2026-01-01" }),
      seal({ id: "b", kana: "チャン" }),
      seal({ id: "t2", kana: "イ", transferred_on: "2026-05-01" }),
      seal({ id: "a", kana: "グエン" }),
    ];
    expect(sortSeals(list).map((s) => s.id)).toEqual(["a", "b", "t2", "t1"]);
  });
});
