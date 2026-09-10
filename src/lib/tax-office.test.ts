import { describe, expect, it } from "vitest";
import {
  autoMailingProgress,
  findTaxOfficeForAddress,
  jurisdictionList,
  mailingProgressLabel,
  matchesTaxOffice,
  normalizeTrackingNumber,
  taxOfficeMailingLines,
  taxOfficeShortName,
  type TaxOffice,
} from "./tax-office";

const office = (name: string, jurisdiction: string): TaxOffice => ({
  id: name,
  name,
  prefecture: "熊本県",
  postal_code: "",
  address: "",
  phone: "",
  jurisdiction,
  website_url: "",
  note: "",
});

const OFFICES = [
  office("熊本西税務署", "熊本市中央区、熊本市西区、熊本市南区、熊本市北区"),
  office("熊本東税務署", "熊本市東区、上益城郡御船町、上益城郡嘉島町、上益城郡益城町"),
  office("八代税務署", "八代市、水俣市、八代郡氷川町、葦北郡芦北町"),
  office("菊池税務署", "菊池市、合志市、菊池郡大津町、菊池郡菊陽町"),
  office("阿蘇税務署", "阿蘇市、阿蘇郡南小国町、阿蘇郡小国町"),
];

describe("jurisdictionList", () => {
  it("「、」「,」空白・改行で区切って市区町村名の配列にする", () => {
    expect(jurisdictionList("熊本市東区、上益城郡益城町, 合志市\n菊池市")).toEqual([
      "熊本市東区",
      "上益城郡益城町",
      "合志市",
      "菊池市",
    ]);
    expect(jurisdictionList("")).toEqual([]);
  });
});

describe("findTaxOfficeForAddress", () => {
  it("住所の区で熊本市の税務署を分ける", () => {
    expect(findTaxOfficeForAddress("熊本県熊本市東区小山3-8-87", OFFICES)?.name).toBe("熊本東税務署");
    expect(findTaxOfficeForAddress("熊本市中央区水道町1-1", OFFICES)?.name).toBe("熊本西税務署");
  });
  it("郡付きの町名でも、住所に郡が無くても当たる", () => {
    expect(findTaxOfficeForAddress("熊本県八代郡氷川町宮原1", OFFICES)?.name).toBe("八代税務署");
    expect(findTaxOfficeForAddress("熊本県菊陽町光の森1-1", OFFICES)?.name).toBe("菊池税務署");
  });
  it("同じ文字を含む町名は長い方（郡付き）を優先する", () => {
    // 「南小国町」は「小国町」も含むが、どちらも阿蘇税務署
    expect(findTaxOfficeForAddress("熊本県阿蘇郡南小国町赤馬場1", OFFICES)?.name).toBe("阿蘇税務署");
  });
  it("当てはまらなければ null", () => {
    expect(findTaxOfficeForAddress("福岡県福岡市博多区1-1", OFFICES)).toBeNull();
    expect(findTaxOfficeForAddress("", OFFICES)).toBeNull();
  });
});

describe("taxOfficeShortName / taxOfficeMailingLines", () => {
  it("「税務署」を外した名前を返す（請求書の「◯◯税務署長 あて」用）", () => {
    expect(taxOfficeShortName("熊本東税務署")).toBe("熊本東");
    expect(taxOfficeShortName("熊本東")).toBe("熊本東");
  });
  it("宛名の行を作る（郵便番号・所在地は空なら出さない）", () => {
    expect(
      taxOfficeMailingLines({ name: "熊本東税務署", postal_code: "862-8686", address: "熊本市東区東町4-14-35" }),
    ).toEqual(["〒862-8686", "熊本市東区東町4-14-35", "熊本東税務署 御中"]);
    expect(taxOfficeMailingLines({ name: "八代税務署", postal_code: "", address: "" })).toEqual([
      "八代税務署 御中",
    ]);
  });
});

describe("matchesTaxOffice", () => {
  it("名前・管轄区域のどちらでも探せる", () => {
    expect(matchesTaxOffice(OFFICES[1], "益城")).toBe(true);
    expect(matchesTaxOffice(OFFICES[1], "熊本東")).toBe(true);
    expect(matchesTaxOffice(OFFICES[1], "八代")).toBe(false);
    expect(matchesTaxOffice(OFFICES[1], "")).toBe(true);
  });
});

describe("進捗", () => {
  it("表示名（未設定は準備中）", () => {
    expect(mailingProgressLabel("preparing")).toBe("準備中");
    expect(mailingProgressLabel("waiting")).toBe("税務署からの郵送待ち");
    expect(mailingProgressLabel("done")).toBe("完了");
    expect(mailingProgressLabel(undefined)).toBe("準備中");
  });
  it("投函日と追跡番号が入ったら準備中→郵送待ちに進める。完了はそのまま", () => {
    expect(autoMailingProgress("preparing", "2026-09-10", "1234-5678-9012")).toBe("waiting");
    expect(autoMailingProgress("preparing", "2026-09-10", "")).toBe("preparing");
    expect(autoMailingProgress(undefined, "", "")).toBe("preparing");
    expect(autoMailingProgress("done", "", "")).toBe("done");
    expect(autoMailingProgress("waiting", "", "")).toBe("waiting");
  });
});

describe("normalizeTrackingNumber", () => {
  it("数字だけにする", () => {
    expect(normalizeTrackingNumber("1234-5678-9012")).toBe("123456789012");
    expect(normalizeTrackingNumber("")).toBe("");
  });
});
