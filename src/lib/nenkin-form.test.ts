import { describe, expect, it } from "vitest";
import {
  buildNenkinDrawItems,
  NENKIN_DAY_CELLS,
  NENKIN_MONTH_CELLS,
  NENKIN_PENSION_CELLS,
  NENKIN_YEAR_CELLS,
  nenkinMissingFields,
  pensionNoDigits,
  type NenkinFormData,
} from "./nenkin-form";

// テスト用の固定幅（1文字 = size の幅）
const measure = (text: string, size: number) => text.length * size;

const base: NenkinFormData = {
  name: "NGUYEN VAN A",
  kana: "グエン バン アー",
  address: "熊本県熊本市東区小山3-8-87カームリーハウスB201",
  birth: "1995-03-07",
  pensionNo: "1234-567890",
  myNumber: "123456789012",
};

const digitsOf = (items: { text: string }[]) =>
  items
    .filter((i) => /^[0-9]$/.test(i.text))
    .map((i) => i.text)
    .join("");

describe("buildNenkinDrawItems", () => {
  it("基礎年金番号10桁をマスに1桁ずつ入れ、個人番号は書かない（数字は黒）", () => {
    const items = buildNenkinDrawItems(base, measure);
    expect(items.some((i) => i.text.startsWith("個人番号"))).toBe(false);
    // 基礎年金番号10桁 → 生年月日8桁の順
    expect(digitsOf(items)).toBe("123456789019950307");
    // 「－」が印字された5つ目のマス（146.7〜167.6）には何も入れない
    const inHyphen = items.filter((i) => /^[0-9]$/.test(i.text) && i.x > 146.7 && i.x + measure(i.text, i.size) < 167.6);
    expect(inHyphen).toHaveLength(0);
    // 4桁目は4つ目のマス、5桁目は6つ目のマスの中央
    const d4 = items.find((i) => i.text === "4")!;
    expect(d4.x + measure("4", d4.size) / 2).toBeCloseTo((NENKIN_PENSION_CELLS[3] + NENKIN_PENSION_CELLS[4]) / 2);
    const d5 = items.filter((i) => i.text === "5")[0];
    expect(d5.x + measure("5", d5.size) / 2).toBeCloseTo((NENKIN_PENSION_CELLS[5] + NENKIN_PENSION_CELLS[6]) / 2);
  });

  it("基礎年金番号が無いときは ① を空欄のまま「1. 交付申請者」の上に個人番号を書く", () => {
    const items = buildNenkinDrawItems({ ...base, pensionNo: "" }, measure);
    const my = items.find((i) => i.text.startsWith("個人番号"))!;
    expect(my.text).toBe("個人番号：123456789012");
    expect(my.color).toBe("red"); // 赤字で書く
    expect(my.x).toBeCloseTo(NENKIN_PENSION_CELLS[0]);
    // 「1. 交付申請者」（上端 203〜213）より上、「年 月 日申請」（上端 178〜188）より下
    expect(838 - my.y).toBeGreaterThan(188);
    expect(838 - my.y).toBeLessThan(203);
    // 残りの数字は生年月日だけ
    expect(digitsOf(items)).toBe("19950307");
  });

  it("基礎年金番号も個人番号も無いときは「個人番号：（未登録）」", () => {
    const items = buildNenkinDrawItems({ ...base, pensionNo: "", myNumber: "" }, measure);
    expect(items.find((i) => i.text.startsWith("個人番号"))!).toMatchObject({ text: "個人番号：（未登録）", color: "red" });
  });

  it("住所・氏名を枠の中に書く（氏名は④性別の仕切り 401 より左）", () => {
    const items = buildNenkinDrawItems(base, measure);
    const address = items.find((i) => i.text === base.address)!;
    expect(838 - address.y).toBeGreaterThan(283);
    expect(838 - address.y).toBeLessThan(322);
    expect(address.x + measure(address.text, address.size)).toBeLessThanOrEqual(531);
    const name = items.find((i) => i.text === base.name)!;
    expect(838 - name.y).toBeGreaterThan(322);
    expect(838 - name.y).toBeLessThan(358);
    expect(name.x + measure(name.text, name.size)).toBeLessThanOrEqual(401);
  });

  it("氏名の欄で、ローマ字の上にフリガナを小さく書く", () => {
    const items = buildNenkinDrawItems(base, measure);
    const kana = items.find((i) => i.text === base.kana)!;
    const name = items.find((i) => i.text === base.name)!;
    expect(kana.size).toBeLessThan(name.size);
    // 同じ枠（上端 322〜358）の中で、フリガナが上・氏名が下
    expect(838 - kana.y).toBeGreaterThan(322);
    expect(838 - kana.y).toBeLessThan(838 - name.y);
    expect(838 - name.y).toBeLessThan(358);
    expect(kana.x).toBe(name.x);
    // フリガナが未登録なら書かない
    expect(buildNenkinDrawItems({ ...base, kana: "" }, measure).some((i) => i.text === base.kana)).toBe(false);
  });

  it("長い住所は2行に分けて枠に収める", () => {
    const long = "熊本県熊本市中央区水前寺公園１丁目２番３号サンプルレジデンス水前寺イーストタワー１２３４号室（長い住所の例）";
    const items = buildNenkinDrawItems({ ...base, address: long }, measure);
    const lines = items.filter((i) => long.startsWith(i.text) || long.endsWith(i.text));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.text).join("")).toBe(long);
    for (const l of lines) {
      expect(838 - l.y).toBeGreaterThan(283);
      expect(838 - l.y).toBeLessThan(322);
      expect(l.x + measure(l.text, l.size)).toBeLessThanOrEqual(531);
    }
  });

  it("生年月日は西暦4桁・月2桁・日2桁をそれぞれのマスの中央に入れる", () => {
    const items = buildNenkinDrawItems({ ...base, pensionNo: "" }, measure);
    const nums = items.filter((i) => /^[0-9]$/.test(i.text));
    const center = (i: { x: number; text: string; size: number }) => i.x + measure(i.text, i.size) / 2;
    expect(center(nums[0])).toBeCloseTo((NENKIN_YEAR_CELLS[0] + NENKIN_YEAR_CELLS[1]) / 2);
    expect(center(nums[3])).toBeCloseTo((NENKIN_YEAR_CELLS[3] + NENKIN_YEAR_CELLS[4]) / 2);
    expect(center(nums[4])).toBeCloseTo((NENKIN_MONTH_CELLS[0] + NENKIN_MONTH_CELLS[1]) / 2);
    expect(center(nums[7])).toBeCloseTo((NENKIN_DAY_CELLS[1] + NENKIN_DAY_CELLS[2]) / 2);
    for (const n of nums) {
      expect(838 - n.y).toBeGreaterThan(358);
      expect(838 - n.y).toBeLessThan(395);
    }
  });

  it("生年月日が未登録なら何も書かない。④性別には何も書かない", () => {
    const items = buildNenkinDrawItems({ ...base, birth: "" }, measure);
    expect(digitsOf(items)).toBe("1234567890");
    expect(items.some((i) => /男|女|Male|Female/.test(i.text))).toBe(false);
  });
});

describe("pensionNoDigits", () => {
  it("区切りを除いた数字だけにする", () => {
    expect(pensionNoDigits("1234-567890")).toBe("1234567890");
    expect(pensionNoDigits("")).toBe("");
  });
});

describe("nenkinMissingFields", () => {
  it("すべて登録済みなら何も返さない", () => {
    expect(nenkinMissingFields(base)).toEqual([]);
    // 基礎年金番号が無くても個人番号があれば足りる
    expect(nenkinMissingFields({ ...base, pensionNo: "" })).toEqual([]);
  });

  it("足りない項目を順に返す", () => {
    expect(nenkinMissingFields({ name: "", kana: "", address: "", birth: "", pensionNo: "", myNumber: "" })).toEqual([
      "氏名",
      "フリガナ",
      "住所",
      "生年月日",
      "基礎年金番号（または個人番号）",
    ]);
    expect(nenkinMissingFields({ ...base, birth: "1995/03/07" })).toEqual(["生年月日"]);
    expect(nenkinMissingFields({ ...base, pensionNo: "1234", myNumber: "12" })).toEqual(["基礎年金番号（または個人番号）"]);
  });
});
