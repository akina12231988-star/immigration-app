import { describe, expect, it } from "vitest";
import { adhocOrgCandidates, adhocOrgName, matchesAdhocOrg } from "./adhoc-report-org";

const row = (org_name: string, orgMasterName?: string) => ({
  org_name,
  organizations: orgMasterName ? { id: "o1", name: orgMasterName } : null,
});

describe("adhocOrgName", () => {
  it("記録時点のスナップショットを優先し、無ければ機関マスタの名称を使う", () => {
    expect(adhocOrgName(row("旧・BASE株式会社", "BASE株式会社"))).toBe("旧・BASE株式会社");
    expect(adhocOrgName(row("", "BASE株式会社"))).toBe("BASE株式会社");
    expect(adhocOrgName(row(""))).toBe("");
  });
});

describe("matchesAdhocOrg", () => {
  it("空欄なら全件そのまま", () => {
    expect(matchesAdhocOrg(row("BASE株式会社"), "")).toBe(true);
    expect(matchesAdhocOrg(row("BASE株式会社"), "  ")).toBe(true);
  });

  it("法人格を省いても、全角・半角が違っても探せる", () => {
    expect(matchesAdhocOrg(row("BASE株式会社"), "BASE")).toBe(true);
    expect(matchesAdhocOrg(row("BASE株式会社"), "base")).toBe(true);
    expect(matchesAdhocOrg(row("ＢＡＳＥ株式会社"), "BASE")).toBe(true);
  });

  it("異体字は常用の字でも探せる", () => {
    expect(matchesAdhocOrg(row("髙濱　伸吉"), "高浜")).toBe(true);
  });

  it("当てはまらない機関は外れる", () => {
    expect(matchesAdhocOrg(row("BASE株式会社"), "井上")).toBe(false);
    // 機関名が空の記録は、絞り込むと出てこない
    expect(matchesAdhocOrg(row(""), "BASE")).toBe(false);
  });
});

describe("adhocOrgCandidates", () => {
  it("一覧に出ている機関名を重複なく五十音順で返す", () => {
    const rows = [row("株式会社さくら"), row("", "あさひ工業"), row("株式会社さくら"), row("")];
    expect(adhocOrgCandidates(rows)).toEqual([
      { id: "あさひ工業", name: "あさひ工業" },
      { id: "株式会社さくら", name: "株式会社さくら" },
    ]);
  });
});
