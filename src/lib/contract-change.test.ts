import { describe, expect, it } from "vitest";
import {
  CONTRACT_CHANGE_CELLS,
  CONTRACT_CHANGE_ITEMS,
  contractChangeItem,
  contractChangeLabels,
} from "./contract-change";

describe("契約内容変更の変更事項（参考様式第3-1-1号 ②ｂ）", () => {
  it("様式のとおりⅠ〜Ⅸの9つある", () => {
    expect(CONTRACT_CHANGE_ITEMS).toHaveLength(9);
    expect(CONTRACT_CHANGE_ITEMS.map((i) => i.code)).toEqual([
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
    ]);
  });

  it("チェック欄のセルは重複しない（同じマスに2つ書き込まない）", () => {
    expect(new Set(CONTRACT_CHANGE_CELLS).size).toBe(CONTRACT_CHANGE_CELLS.length);
  });

  it("どの事項にも記載要領の「変更内容」が入っている", () => {
    for (const item of CONTRACT_CHANGE_ITEMS) {
      expect(item.items.length).toBeGreaterThan(0);
    }
    expect(contractChangeItem("VII")?.items).toContain("基本賃金");
    expect(contractChangeItem("I")?.items).toEqual(["雇用契約期間", "契約更新の有無"]);
  });

  it("コードを様式の表記に直す（知らないコードはそのまま）", () => {
    expect(contractChangeLabels(["I", "VII"])).toEqual(["Ⅰ.雇用契約期間", "Ⅶ.賃金"]);
    expect(contractChangeLabels(["X"])).toEqual(["X"]);
  });
});
