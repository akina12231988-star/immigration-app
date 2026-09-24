import { describe, expect, it } from "vitest";
import { PLEDGE_GUIDE_ROWS } from "@/lib/ssw2-pledge-guide";
import { SSW2_DUTY_FIELDS, SSW2_INSTRUCTEE_DEFAULT_FIELDS } from "@/lib/org-ssw2-duties";

describe("PLEDGE_GUIDE_ROWS", () => {
  it("業務内容①〜④と対象者の共通の内容の欄が、すべて対応表にある", () => {
    const forms = PLEDGE_GUIDE_ROWS.map((r) => r.form).join("\n");
    for (const f of SSW2_DUTY_FIELDS) expect(forms).toContain(f.label);
    for (const f of SSW2_INSTRUCTEE_DEFAULT_FIELDS) expect(forms).toContain(f.label);
  });

  it("署名欄（作成年月日・所属機関・作成責任者・本人の署名）もある", () => {
    const forms = PLEDGE_GUIDE_ROWS.map((r) => r.form);
    expect(forms).toContain("作成年月日");
    expect(forms).toContain("特定技能所属機関の氏名又は名称");
    expect(forms).toContain("作成責任者の氏名及び役職");
    expect(forms).toContain("２号特定技能外国人の署名");
  });

  it("手順は STEP 1〜4 のどれか", () => {
    for (const r of PLEDGE_GUIDE_ROWS) expect([1, 2, 3, 4]).toContain(r.step);
  });

  it("様式の欄が重複しない（表の key に使う）", () => {
    const forms = PLEDGE_GUIDE_ROWS.map((r) => r.form);
    expect(new Set(forms).size).toBe(forms.length);
  });
});
