import { describe, expect, it } from "vitest";
import { buildPrometricAddress, cityRomaji, hasInvalidPrometricChars, kanaToRomaji, splitHouseNumber, townRomaji } from "./address-romaji";

describe("kanaToRomaji（ヘボン式・長音は書かない）", () => {
  it("読み仮名をローマ字にする", () => {
    expect(kanaToRomaji("やつしろ")).toBe("yatsushiro");
    expect(kanaToRomaji("ぐんちくじゅういちばんちょう")).toBe("gunchikujuichibancho");
    expect(kanaToRomaji("トウキョウ")).toBe("tokyo");
    expect(kanaToRomaji("はっとり")).toBe("hattori");
    expect(kanaToRomaji("まっちゃ")).toBe("matcha");
    expect(kanaToRomaji("おおさか")).toBe("osaka");
  });
});

describe("cityRomaji", () => {
  it("市・町・村・郡を分ける", () => {
    expect(cityRomaji("八代市", "やつしろし")).toBe("Yatsushiro-shi");
    expect(cityRomaji("上益城郡益城町", "かみましきぐんましきまち")).toBe("Kamimashiki-gun Mashiki-machi");
    expect(cityRomaji("球磨郡あさぎり町", "くまぐんあさぎりちょう")).toBe("Kuma-gun Asagiri-cho");
  });
});

describe("townRomaji・splitHouseNumber", () => {
  it("丁目は番地の前に回す", () => {
    expect(townRomaji("郡築三番町", "ぐんちくさんばんちょう").name).toBe("Gunchiku 3-bancho");
    expect(townRomaji("小山二丁目", "おやまにちょうめ")).toEqual({ name: "Oyama", chome: 2 });
    expect(townRomaji("郡築十一番町", "ぐんちくじゅういちばんちょう")).toEqual({ name: "Gunchiku 11-bancho", chome: null });
  });
  it("番地と建物を分ける", () => {
    expect(splitHouseNumber("79番地2")).toEqual({ number: "79-2", building: "" });
    expect(splitHouseNumber("13-20日産共同住宅201号")).toEqual({ number: "13-20", building: "日産共同住宅201号" });
    expect(splitHouseNumber("3丁目9-3")).toEqual({ number: "3-9-3", building: "" });
  });
});

describe("buildPrometricAddress", () => {
  it("プロメトリックの欄に分けて英字にする", () => {
    const a = buildPrometricAddress({
      prefecture: "熊本県", city: "八代市", cityKana: "やつしろし", town: "郡築十一番町", townKana: "ぐんちくじゅういちばんちょう", rest: "79番地2", postal: "8660034",
    });
    expect(a).toMatchObject({ street: "79-2 Gunchiku 11-bancho", city: "Yatsushiro-shi", prefecture: "Kumamoto-ken", postal: "866-0034", building: "", warnings: [] });
    expect(hasInvalidPrometricChars(a.street)).toBe(false);
  });
  it("漢字の建物名は直すよう知らせる", () => {
    const a = buildPrometricAddress({
      prefecture: "熊本県", city: "熊本市東区", cityKana: "くまもとしひがしく", town: "小山二丁目", townKana: "おやまにちょうめ", rest: "13-20日産共同住宅201号", postal: "8628000",
    });
    expect(a.street).toBe("2-13-20 Oyama");
    expect(a.warnings.some((w) => w.includes("建物名"))).toBe(true);
  });
});
