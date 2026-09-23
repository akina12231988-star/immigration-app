import { describe, expect, it } from "vitest";
import {
  canPrintCouncilList,
  councilDate,
  councilLangForNationality,
  councilListRows,
  normalizeCouncilTranslations,
  splitCouncilTo,
} from "./council-list";
import {
  autoTranslation,
  parseJpPlace,
  romanizeBranch,
  romanizePlace,
  translateBranch,
  translateCity,
  translateMethod,
  translationSources,
} from "./council-translate";

const office = [
  { to: "（本社）長崎県雲仙市", on: "2025-04-22", method: "提出した書面の控え", method_note: "" },
  { to: "（愛野営業所）長崎県雲仙市", on: "2025-04-22", method: "メール", method_note: "" },
  { to: "", on: "", method: "", method_note: "" },
];

describe("協力確認書の一覧表", () => {
  it("提出先を営業所名と市区町村に分ける", () => {
    expect(splitCouncilTo("（本社）長崎県雲仙市")).toEqual({ branch: "本社", city: "長崎県雲仙市" });
    expect(splitCouncilTo("(愛野営業所) 長崎県雲仙市")).toEqual({ branch: "愛野営業所", city: "長崎県雲仙市" });
    expect(splitCouncilTo("熊本県八代市")).toEqual({ branch: "", city: "熊本県八代市" });
  });
  it("入力のある行だけ・2か所以上で印刷できる", () => {
    expect(councilListRows(office)).toHaveLength(2);
    expect(canPrintCouncilList(office, [])).toBe(true);
    expect(canPrintCouncilList(office.slice(0, 1), office.slice(0, 1))).toBe(false);
  });
  it("日付の表記", () => {
    expect(councilDate("2025-04-22", "ja")).toBe("2025/4/22");
    expect(councilDate("2025-04-22", "km")).toBe("22/4/2025");
  });
  it("訳: 保存した訳 → 辞書（住所データ） → 日本語のまま", () => {
    const saved = { km: { 愛野営業所: "សាខា Aino" } };
    expect(translateBranch("本社", "km", saved)).toBe("ស្នាក់ការកណ្ដាល");
    expect(translateBranch("愛野営業所", "km", saved)).toBe("សាខា Aino");
    expect(translateBranch("愛野営業所", "vi", saved)).toBe("愛野営業所");
    expect(translateCity("長崎県雲仙市", "km", saved)).toBe("ខេត្ត Nagasaki, ទីក្រុង Unzen");
    expect(translateMethod("メール", "km", saved)).toBe("អ៊ីមែល");
    expect(translateMethod("提出した書面の控え", "en", saved)).toBe("Copy of submitted document");
    expect(translationSources(councilListRows(office))).toEqual(["長崎県雲仙市", "愛野営業所"]);
  });
  it("国籍から言語・訳の正規化", () => {
    expect(councilLangForNationality("カンボジア")).toBe("km");
    expect(councilLangForNationality("ネパール")).toBe("en");
    expect(normalizeCouncilTranslations({ km: { a: "x", b: "", c: 1 }, xx: { a: "y" } })).toEqual({ km: { a: "x" } });
  });
});

describe("住所データで市区町村・営業所名を訳す（無料）", () => {
  it("都道府県・郡・市区町村に分ける", () => {
    expect(parseJpPlace("長崎県雲仙市")?.city).toEqual({ r: "Unzen", kind: "市" });
    expect(parseJpPlace("北海道安平町")?.city).toEqual({ r: "Abira", kind: "町" });
    expect(parseJpPlace("埼玉県児玉郡上里町")?.city).toEqual({ r: "Kamisato", kind: "町" });
    expect(parseJpPlace("鹿児島県出水郡")).toMatchObject({ county: "Izumi" });
    expect(parseJpPlace("鹿児島出水郡")).toMatchObject({ pref: { r: "Kagoshima" }, county: "Izumi" });
  });
  it("クメール語は見本と同じ書き方", () => {
    expect(romanizePlace("長崎県雲仙市", "km")).toBe("ខេត្ត Nagasaki, ទីក្រុង Unzen");
    expect(romanizePlace("鹿児島県出水郡", "km")).toBe("ខេត្ត Kagoshima, ស្រុក Izumi");
    expect(romanizePlace("北海道安平町", "km")).toBe("Hokkaido, ឃុំ Abira");
    expect(romanizePlace("熊本県八代市", "km")).toBe("ខេត្ត Kumamoto, ទីក្រុង Yatsushiro");
  });
  it("ほかの言語", () => {
    expect(romanizePlace("長崎県雲仙市", "en")).toBe("Unzen City, Nagasaki");
    expect(romanizePlace("鳥取県米子市", "vi")).toBe("Thành phố Yonago, tỉnh Tottori");
    expect(romanizePlace("存在しない地名", "en")).toBeNull();
  });
  it("営業所名の地名部分", () => {
    expect(romanizeBranch("鹿児島営業所", "km")).toBe("សាខា Kagoshima");
    expect(romanizeBranch("北海道壮瞥営業所", "km")).toBe("សាខា Hokkaido Sobetsu");
    expect(romanizeBranch("関東営業所", "en")).toBe("Kanto Branch");
    expect(romanizeBranch("熊本営業所", "vi")).toBe("Chi nhánh Kumamoto");
    expect(romanizeBranch("愛野営業所", "km")).toBeNull();
    expect(autoTranslation("鳥取営業所", "km")).toBe("សាខា Tottori");
    expect(autoTranslation("北海道安平町", "km")).toBe("Hokkaido, ឃុំ Abira");
  });
});
