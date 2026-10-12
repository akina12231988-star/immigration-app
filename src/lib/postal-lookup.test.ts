import { describe, expect, it } from "vitest";
import { matchCity, matchTown, normalizePostal, prefectureOfAddress, resolvePostal } from "./postal-lookup";

const cities = ["八代市", "熊本市東区", "熊本市中央区", "阿蘇郡西原村", "阿蘇郡南阿蘇村", "八代郡氷川町"];
const towns: Record<string, { town: string; postal: string }[]> = {
  八代市: [
    { town: "郡築一番町", postal: "866-0006" },
    { town: "郡築三番町", postal: "866-0008" },
    { town: "以下に掲載がない場合", postal: "866-0000" },
  ],
  阿蘇郡西原村: [{ town: "布田", postal: "861-2403" }, { town: "小森", postal: "861-2404" }],
  熊本市東区: [{ town: "小山", postal: "861-8045" }, { town: "小山町", postal: "861-8046" }],
};
const townsOf = (_p: string, city: string) => towns[city] ?? null;

describe("住所 → 郵便番号", () => {
  it("都道府県・市区町村・町域の順に当てはめる", () => {
    expect(resolvePostal("熊本県八代市郡築三番町175番地2", cities, townsOf)).toEqual({
      prefecture: "熊本県", city: "八代市", town: "郡築三番町", postal: "8660008",
    });
  });

  it("郡のある町村と「大字」も扱える", () => {
    expect(resolvePostal("熊本県阿蘇郡西原村大字布田1173番地２", cities, townsOf)?.postal).toBe("8612403");
  });

  it("町域はいちばん長く一致するもの（小山 と 小山町）", () => {
    expect(resolvePostal("熊本県熊本市東区小山町1-2", cities, townsOf)?.postal).toBe("8618046");
    expect(resolvePostal("熊本県熊本市東区小山2丁目13-20", cities, townsOf)?.postal).toBe("8618045");
  });

  it("町域が見つからなければ「以下に掲載がない場合」、それも無ければ null", () => {
    expect(resolvePostal("熊本県八代市知らない町1", cities, townsOf)?.postal).toBe("8660000");
    expect(resolvePostal("熊本県阿蘇郡西原村知らない1", cities, townsOf)).toBeNull();
    expect(resolvePostal("", cities, townsOf)).toBeNull();
    expect(resolvePostal("熊本県知らない市1", cities, townsOf)).toBeNull();
  });

  it("部品の関数", () => {
    expect(prefectureOfAddress("東京都千代田区1-1-1")).toBe("東京都");
    expect(prefectureOfAddress("鹿児島県鹿児島市")).toBe("鹿児島県");
    expect(matchCity("熊本市東区小山", cities)).toBe("熊本市東区");
    expect(matchTown("字布田1173", towns["阿蘇郡西原村"])?.postal).toBe("861-2403");
    expect(normalizePostal("866-0008")).toBe("8660008");
    expect(normalizePostal("８６６－０００８")).toBe("8660008");
    expect(normalizePostal("866")).toBe("");
  });
});
