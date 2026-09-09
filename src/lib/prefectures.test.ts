import { describe, expect, it } from "vitest";
import {
  effectivePrefecture,
  groupByPrefecture,
  guessPrefecture,
  matchesMunicipality,
  municipalityShortName,
  PREFECTURE_LIST,
  PREFECTURE_REGIONS,
  PREFECTURE_TILES,
  prefectureShortName,
} from "./prefectures";

describe("都道府県の表", () => {
  it("47都道府県がそろい、地方とタイルの位置が全部にある", () => {
    expect(PREFECTURE_LIST).toHaveLength(47);
    const inRegions = PREFECTURE_REGIONS.flatMap((r) => r.prefectures);
    expect([...inRegions].sort()).toEqual([...PREFECTURE_LIST].sort());
    expect(Object.keys(PREFECTURE_TILES)).toHaveLength(47);
    // タイルの位置は重ならない
    const cells = new Set(Object.values(PREFECTURE_TILES).map(([x, y]) => `${x},${y}`));
    expect(cells.size).toBe(47);
    expect(prefectureShortName("熊本県")).toBe("熊本");
    expect(prefectureShortName("東京都")).toBe("東京");
    expect(prefectureShortName("北海道")).toBe("北海道");
  });
});

describe("自治体名から都道府県を推定", () => {
  it("県名で始まる・含む・市名から", () => {
    expect(guessPrefecture("愛知県あま市")).toBe("愛知県");
    expect(guessPrefecture("沖縄県中頭郡読谷村")).toBe("沖縄県");
    expect(guessPrefecture("熊本市")).toBe("熊本県");
    expect(guessPrefecture("玉名市役所")).toBe("熊本県");
    expect(guessPrefecture("御坊市役所")).toBe("和歌山県");
    expect(guessPrefecture("どこか町")).toBe("");
    expect(guessPrefecture("")).toBe("");
  });

  it("登録済みの都道府県を優先する", () => {
    expect(effectivePrefecture({ name: "熊本市", prefecture: "" })).toBe("熊本県");
    expect(effectivePrefecture({ name: "玉名市役所", prefecture: "福岡県" })).toBe("福岡県");
    expect(effectivePrefecture({ name: "玉名市役所", prefecture: "県" })).toBe("熊本県");
  });

  it("名札に出す短い名前", () => {
    expect(municipalityShortName("愛知県あま市", "愛知県")).toBe("あま市");
    expect(municipalityShortName("玉名市役所", "熊本県")).toBe("玉名市");
    expect(municipalityShortName("熊本市", "熊本県")).toBe("熊本市");
    expect(municipalityShortName("群馬県利根郡昭和村", "群馬県")).toBe("利根郡昭和村");
  });
});

describe("検索とまとめ", () => {
  const rows = [
    { name: "愛知県あま市", prefecture: "愛知県", cert_name: "課税証明書", note: "" },
    { name: "熊本市", prefecture: "", cert_name: "市民税・県民税 課税証明書", note: "" },
    { name: "玉名市役所", prefecture: "", cert_name: "所得課税証明書", note: "" },
    { name: "埼玉県新座市", prefecture: "", cert_name: "課税証明書", note: "転出後に住所変更があった場合は履歴の写し" },
    { name: "どこか町", prefecture: "", cert_name: "課税証明書", note: "" },
  ];
  it("自治体名・県名・証明書名・備考で探せる（空白区切りは AND）", () => {
    expect(rows.filter((r) => matchesMunicipality(r, "熊本")).map((r) => r.name)).toEqual(["熊本市", "玉名市役所"]);
    expect(rows.filter((r) => matchesMunicipality(r, "所得")).map((r) => r.name)).toEqual(["玉名市役所"]);
    expect(rows.filter((r) => matchesMunicipality(r, "履歴")).map((r) => r.name)).toEqual(["埼玉県新座市"]);
    expect(rows.filter((r) => matchesMunicipality(r, "熊本 玉名")).map((r) => r.name)).toEqual(["玉名市役所"]);
    expect(rows.filter((r) => matchesMunicipality(r, "")).length).toBe(5);
  });

  it("地方→県の順にまとめ、分からないものは最後", () => {
    const g = groupByPrefecture(rows);
    expect(g.map((x) => x.prefecture)).toEqual(["埼玉県", "愛知県", "熊本県", ""]);
    expect(g[2].rows.map((r) => r.name)).toEqual(["熊本市", "玉名市役所"]);
    expect(g[3].region).toBe("都道府県が未設定");
  });
});
