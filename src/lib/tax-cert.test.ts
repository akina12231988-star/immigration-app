import { describe, expect, it } from "vitest";
import { buildExtraDocs, extraDocsSummary } from "./tax-cert";

describe("buildExtraDocs（転出届・住民票）", () => {
  it("チェックした書類だけが追加される", () => {
    expect(buildExtraDocs(false, false, false)).toEqual([]);

    const tenshutsuOnly = buildExtraDocs(true, false, false);
    expect(tenshutsuOnly).toHaveLength(1);
    expect(tenshutsuOnly[0].title).toBe("転出届");
    expect(tenshutsuOnly[0].isExtra).toBe(true);

    const both = buildExtraDocs(true, true, false);
    expect(both.map((d) => d.title)).toEqual([
      "転出届",
      "住民票の写し（個人番号の記載なし）",
    ]);
  });

  it("住民票は個人番号（マイナンバー）記載の有無をタイトルに含める", () => {
    expect(buildExtraDocs(false, true, true)[0].title).toBe(
      "住民票の写し（個人番号の記載あり）",
    );
    expect(buildExtraDocs(false, true, false)[0].title).toBe(
      "住民票の写し（個人番号の記載なし）",
    );
  });
});

describe("extraDocsSummary", () => {
  it("記録一覧用の要約を作る", () => {
    expect(extraDocsSummary({})).toBe("");
    expect(extraDocsSummary({ hasTenshutsu: true })).toBe("転出届");
    expect(
      extraDocsSummary({ hasTenshutsu: true, hasJuminhyo: true, juminhyoMyNumber: true }),
    ).toBe("転出届 ・ 住民票（個人番号 記載あり）");
    expect(extraDocsSummary({ hasJuminhyo: true })).toBe("住民票（個人番号 記載なし）");
  });
});
