import { describe, expect, it } from "vitest";
import {
  canPrintCouncilList,
  councilDate,
  councilLangForNationality,
  councilListRows,
  normalizeCouncilTranslations,
  splitCouncilTo,
  translateBranch,
  translateCity,
  translateMethod,
  untranslatedTexts,
} from "./council-list";

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
  it("訳: 辞書 → 保存した訳 → 目安", () => {
    const saved = { km: { 愛野営業所: "សាខា Aino", 長崎県雲仙市: "ខេត្ត Nagasaki, ទីក្រុង Unzen" } };
    expect(translateBranch("本社", "km", saved)).toBe("ស្នាក់ការកណ្ដាល");
    expect(translateBranch("愛野営業所", "km", saved)).toBe("សាខា Aino");
    expect(translateCity("長崎県雲仙市", "km", saved)).toBe("ខេត្ត Nagasaki, ទីក្រុង Unzen");
    expect(translateCity("熊本県八代市", "km", saved)).toBe("Kumamoto, 八代市");
    expect(translateMethod("メール", "km", saved)).toBe("អ៊ីមែល");
    expect(translateMethod("提出した書面の控え", "en", saved)).toBe("Copy of submitted document");
    expect(untranslatedTexts(councilListRows(office), "km", saved)).toEqual([]);
    expect(untranslatedTexts(councilListRows(office), "vi", saved)).toEqual(["長崎県雲仙市", "愛野営業所"]);
  });
  it("国籍から言語・訳の正規化", () => {
    expect(councilLangForNationality("カンボジア")).toBe("km");
    expect(councilLangForNationality("ネパール")).toBe("en");
    expect(normalizeCouncilTranslations({ km: { a: "x", b: "", c: 1 }, xx: { a: "y" } })).toEqual({ km: { a: "x" } });
  });
});
