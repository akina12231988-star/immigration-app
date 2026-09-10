import { describe, expect, it } from "vitest";
import { buildNozei3DrawItems, type Nozei3FormData } from "./nozei3-form";
import { isMyNumberFillable } from "./tax-office";

// テスト用の固定幅（1文字 = size の幅）
const measure = (text: string, size: number) => text.length * size;

const base: Nozei3FormData = {
  name: "NGUYEN VAN A",
  kana: "グエン バン アー",
  address: "熊本県熊本市東区小山3-8-87カームリーハウスB201",
  myNumber: "123456789012",
  taxOfficeName: "熊本東税務署",
};

describe("buildNozei3DrawItems", () => {
  it("税務署名・住所・フリガナ・氏名・個人番号12桁を書き込む", () => {
    const items = buildNozei3DrawItems(base, measure);
    const texts = items.map((i) => i.text);
    expect(texts).toContain("熊本東"); // 「税務署長 あて」の前に入れるので「税務署」は付けない
    expect(texts).toContain(base.address);
    expect(texts).toContain(base.kana);
    expect(texts).toContain(base.name);
    // 個人番号は1桁ずつ12個
    expect(items.filter((i) => /^[0-9]$/.test(i.text)).map((i) => i.text).join("")).toBe("123456789012");
  });

  it("税務署名は「税務署長」の文字の左に右寄せで置く", () => {
    const office = buildNozei3DrawItems(base, measure).find((i) => i.text === "熊本東")!;
    expect(office.x + measure("熊本東", office.size)).toBeCloseTo(124);
  });

  it("枠の右上（x=298〜528・上端から93〜200pt）に収まる", () => {
    const items = buildNozei3DrawItems(base, measure).filter((i) => i.text !== "熊本東");
    for (const it of items) {
      expect(it.x).toBeGreaterThanOrEqual(298);
      expect(it.x + measure(it.text, it.size)).toBeLessThanOrEqual(531.5);
      expect(842 - it.y).toBeGreaterThan(93);
      expect(842 - it.y).toBeLessThan(200.5);
    }
  });

  it("個人番号は左端のマスを空けて、12マスに1桁ずつ中央に置く", () => {
    const digits = buildNozei3DrawItems(base, measure).filter((i) => /^[0-9]$/.test(i.text));
    // 1桁目は 312.8〜330.8 のマスの中央（x + 幅/2）
    expect(digits[0].x + measure("1", digits[0].size) / 2).toBeCloseTo((312.8 + 330.8) / 2);
    // 左端のマス（294〜312.8）には何も置かない
    expect(digits.every((d) => d.x >= 312.8)).toBe(true);
    // 12桁目は右端のマス
    expect(digits[11].x + measure("2", digits[11].size) / 2).toBeCloseTo((513.6 + 531) / 2);
  });

  it("個人番号が12桁でなければ書かない（未登録・桁違いは空欄のまま）", () => {
    const items = buildNozei3DrawItems({ ...base, myNumber: "" }, measure);
    expect(items.some((i) => /^[0-9]$/.test(i.text))).toBe(false);
    const items2 = buildNozei3DrawItems({ ...base, myNumber: "12345" }, measure);
    expect(items2.some((i) => /^[0-9]$/.test(i.text))).toBe(false);
  });

  it("長い住所は縮小し、それでも収まらなければ2行に分ける", () => {
    const long = "熊本県熊本市東区小山".repeat(5); // 50文字 → 6.5pt でも 325pt で収まらない
    const items = buildNozei3DrawItems({ ...base, address: long }, measure);
    const addr = items.filter((i) => long.includes(i.text) && i.text !== "熊本東" && i.text.length > 5);
    expect(addr.length).toBe(2);
    expect(addr[0].text + addr[1].text).toBe(long);
    expect(addr[0].y).toBeGreaterThan(addr[1].y); // 1行目が上
  });

  it("税務署名が空なら書かない。空の項目は飛ばす", () => {
    const items = buildNozei3DrawItems(
      { name: "A", kana: "", address: "", myNumber: "", taxOfficeName: "" },
      measure,
    );
    expect(items.map((i) => i.text)).toEqual(["A"]);
  });
});

describe("isMyNumberFillable", () => {
  it("数字12桁のときだけ true（ハイフン入りも可）", () => {
    expect(isMyNumberFillable("123456789012")).toBe(true);
    expect(isMyNumberFillable("1234-5678-9012")).toBe(true);
    expect(isMyNumberFillable("")).toBe(false);
    expect(isMyNumberFillable("12345")).toBe(false);
  });
});
