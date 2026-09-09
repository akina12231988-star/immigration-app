import { describe, expect, it } from "vitest";
import { adhocOrgCandidates, adhocOrgName, adhocSearchSuggestions, matchesAdhocOrg } from "./adhoc-report-org";

const row = (org_name: string, orgMasterName?: string, worker?: { name: string; kana?: string }) => ({
  org_name,
  organizations: orgMasterName ? { id: "o1", name: orgMasterName } : null,
  workers: worker ?? null,
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

  it("外国人の氏名・ふりがなでも探せる（空白や大文字小文字の違いは無視）", () => {
    const r = row("BASE株式会社", undefined, { name: "NGUYEN VAN A", kana: "グエン バン アー" });
    expect(matchesAdhocOrg(r, "nguyen")).toBe(true);
    expect(matchesAdhocOrg(r, "VANA")).toBe(true);
    expect(matchesAdhocOrg(r, "グエン")).toBe(true);
    expect(matchesAdhocOrg(r, "TRAN")).toBe(false);
  });

  it("当てはまらない機関は外れる", () => {
    expect(matchesAdhocOrg(row("BASE株式会社"), "井上")).toBe(false);
    // 機関名が空の記録は、絞り込むと出てこない
    expect(matchesAdhocOrg(row(""), "BASE")).toBe(false);
  });
});

describe("adhocOrgCandidates", () => {
  it("一覧に出ている機関名と外国人名を重複なく五十音順で返す（機関→外国人）", () => {
    const rows = [
      row("株式会社さくら", undefined, { name: "NGUYEN VAN A", kana: "グエン" }),
      row("", "あさひ工業"),
      row("株式会社さくら", undefined, { name: "NGUYEN VAN A", kana: "グエン" }),
      row(""),
    ];
    expect(adhocOrgCandidates(rows)).toEqual([
      { id: "org:あさひ工業", name: "あさひ工業", kind: "org" },
      { id: "org:株式会社さくら", name: "株式会社さくら", kind: "org" },
      { id: "worker:NGUYEN VAN A", name: "NGUYEN VAN A", kana: "グエン", kind: "worker" },
    ]);
  });

  it("候補の絞り込みは機関名・外国人名のどちらでも", () => {
    const cands = adhocOrgCandidates([
      row("BASE株式会社", undefined, { name: "NGUYEN VAN A", kana: "グエン" }),
      row("株式会社さくら", undefined, { name: "TRAN THI B", kana: "チャン" }),
    ]);
    expect(adhocSearchSuggestions(cands, "base").map((c) => c.name)).toEqual(["BASE株式会社"]);
    expect(adhocSearchSuggestions(cands, "チャン").map((c) => c.name)).toEqual(["TRAN THI B"]);
    expect(adhocSearchSuggestions(cands, "")).toEqual([]);
  });
});
