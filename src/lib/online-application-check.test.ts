import { describe, expect, it } from "vitest";
import { checkOnlineInput, onlineValueMatches } from "@/lib/online-application-check";
import type { OnlineSection } from "@/lib/online-application";

const sections = (items: { no: string; label: string; value: string; skip?: boolean }[]): OnlineSection[] => [
  { title: "身分事項", items: items.map((i) => ({ format: "text", ...i }) as never) },
];

// 入管の確認画面（申込内容照会）をコピーしたときの形を模したもの
const pasted = `
1　国籍・地域 ベトナム Viet Nam
2　生年月日 2005年03月27日
3　氏名 BUI MANH CUONG
4　性別 男 Male
6　配偶者の有無 無 Single
１１．１　現に有する在留資格 特定技能１号 Specified Skilled Worker (i)
9.3　日本における連絡先　電話番号 05088904000
`;

describe("onlineValueMatches（表記のならし）", () => {
  it("和英併記・全半角・日付・ハイフンの違いをならして比べる", () => {
    expect(onlineValueMatches("男", "男 Male")).toBe(true);
    expect(onlineValueMatches("無", "無 Single")).toBe(true);
    expect(onlineValueMatches("有", "無 Single")).toBe(false);
    expect(onlineValueMatches("2005-03-27", "2005年03月27日")).toBe(true);
    expect(onlineValueMatches("特定技能1号", "特定技能１号 Specified Skilled Worker (i)")).toBe(true);
    expect(onlineValueMatches("050-8890-4000", "05088904000")).toBe(true);
  });
});

describe("checkOnlineInput（確認画面の貼り付けチェック）", () => {
  it("一致・不一致・見つからない項目を数える", () => {
    const s = sections([
      { no: "1", label: "国籍・地域", value: "ベトナム" },
      { no: "2", label: "生年月日", value: "2005-03-27" },
      { no: "4", label: "性別", value: "女" }, // わざと違う
      { no: "6", label: "配偶者の有無", value: "無" },
      { no: "9.3", label: "日本における連絡先　電話番号", value: "05088904000" },
      { no: "99", label: "ここには無い項目", value: "なにか" },
      { no: "", label: "空の項目は飛ばす", value: "" },
      { no: "", label: "skipの項目も飛ばす", value: "x", skip: true },
    ]);
    const r = checkOnlineInput(s, pasted);
    expect(r.checked).toBe(6);
    expect(r.ok).toBe(4);
    expect(r.ng).toBe(1);
    expect(r.notfound).toBe(1);
    const ng = r.results.find((x) => x.status === "ng");
    expect(ng?.label).toBe("性別");
    expect(ng?.found).toContain("男");
  });

  it("項目番号が全角（１１．１）でもラベルで見つけて比べられる", () => {
    const s = sections([{ no: "11.1", label: "現に有する在留資格", value: "特定技能1号" }]);
    const r = checkOnlineInput(s, pasted);
    expect(r.ok).toBe(1);
    expect(r.ng).toBe(0);
  });
});
