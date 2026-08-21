import { describe, expect, it } from "vitest";
import {
  matchesOrganizationName,
  normalizeOrgSearchText,
  organizationSuggestions,
  orgSearchKeys,
} from "./org-search";

const org = (name: string) => ({ name });

describe("normalizeOrgSearchText", () => {
  it("全角の英数を半角にして小文字にそろえる", () => {
    expect(normalizeOrgSearchText("ＢＡＳＥ")).toBe("base");
  });

  it("空白（半角・全角）と中黒を取り除く", () => {
    expect(normalizeOrgSearchText("井上　雅夫")).toBe("井上雅夫");
    expect(normalizeOrgSearchText("井上 雅夫")).toBe("井上雅夫");
  });

  it("カタカナをひらがなにそろえる", () => {
    expect(normalizeOrgSearchText("ベース")).toBe(normalizeOrgSearchText("べーす"));
  });

  it("異体字を常用の字にそろえる", () => {
    expect(normalizeOrgSearchText("髙濱")).toBe("高浜");
    expect(normalizeOrgSearchText("國崎青果")).toBe("国崎青果");
  });
});

describe("orgSearchKeys", () => {
  it("法人格を外した形も突き合わせに使う", () => {
    expect(orgSearchKeys("BASE株式会社")).toEqual(["base株式会社", "base"]);
  });

  it("法人格が無ければ1つだけ", () => {
    expect(orgSearchKeys("三山圭史")).toEqual(["三山圭史"]);
  });
});

describe("matchesOrganizationName", () => {
  it("会社名の一部を入れると見つかる", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "base")).toBe(true);
    expect(matchesOrganizationName(org("有限会社國崎青果"), "国崎")).toBe(true);
    expect(matchesOrganizationName(org("井上　雅夫"), "井上")).toBe(true);
  });

  it("法人格の付け方が逆でも見つかる", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "株式会社BASE")).toBe(true);
  });

  it("全角・半角、大文字・小文字の違いは無視する", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "ＢＡＳＥ")).toBe(true);
    expect(matchesOrganizationName(org("BASE株式会社"), "Base")).toBe(true);
  });

  it("空白の入れ方が違っても見つかる", () => {
    expect(matchesOrganizationName(org("井上　雅夫"), "井上雅夫")).toBe(true);
    expect(matchesOrganizationName(org("井上雅夫"), "井上 雅夫")).toBe(true);
  });

  it("異体字を常用の字で入れても見つかる（逆も）", () => {
    expect(matchesOrganizationName(org("髙濱　伸吉"), "高浜")).toBe(true);
    expect(matchesOrganizationName(org("高浜伸吉"), "髙濱")).toBe(true);
  });

  it("関係のない会社は出さない", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "三山")).toBe(false);
  });

  it("入力が空（または空白だけ）ならすべて対象にする", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "")).toBe(true);
    expect(matchesOrganizationName(org("BASE株式会社"), "　")).toBe(true);
  });

  it("法人格だけを入れたときは、法人格を含む会社が出る", () => {
    expect(matchesOrganizationName(org("BASE株式会社"), "株式会社")).toBe(true);
    expect(matchesOrganizationName(org("三山圭史"), "株式会社")).toBe(false);
  });
});

describe("organizationSuggestions", () => {
  const orgs = [
    org("有限会社國崎青果"),
    org("井上　雅夫"),
    org("井上洋介"),
    org("井上 有基"),
    org("BASE株式会社"),
  ];

  it("入力が空なら候補を出さない", () => {
    expect(organizationSuggestions(orgs, "")).toEqual([]);
  });

  it("同じ前方一致なら名前順で並べる（毎回同じ並びになる）", () => {
    expect(organizationSuggestions(orgs, "井上").map((o) => o.name)).toEqual([
      "井上　雅夫",
      "井上 有基",
      "井上洋介",
    ]);
  });

  it("前方一致を、途中に含むだけの会社より先に出す", () => {
    const list = [org("熊本井上農園"), org("井上洋介")];
    expect(organizationSuggestions(list, "井上").map((o) => o.name)).toEqual([
      "井上洋介",
      "熊本井上農園",
    ]);
  });

  it("法人格を外した前方一致を先に出す", () => {
    expect(organizationSuggestions(orgs, "base").map((o) => o.name)).toEqual(["BASE株式会社"]);
  });

  it("件数の上限を守る", () => {
    expect(organizationSuggestions(orgs, "井上", 2)).toHaveLength(2);
  });
});
