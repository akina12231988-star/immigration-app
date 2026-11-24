import { describe, expect, it } from "vitest";
import { signedPageCountMessage, signedReplacePlan } from "./signed-pages";

describe("署名したページを取り込んで差し替える", () => {
  it("様式の順・署名ページの順に、取り込んだページを当てはめる", () => {
    const { plans, total } = signedReplacePlan([
      { key: "t1-5", pageCount: 4, signPages: [1, 3] },
      { key: "t1-6-1", pageCount: 3, signPages: [] }, // 印なし → 入れない
      { key: "guidance", pageCount: 2, signPages: undefined }, // 全部のページ
      { key: "t1-18", pageCount: 9, signPages: [7] },
    ]);
    expect(total).toBe(5);
    expect(plans).toEqual([
      { key: "t1-5", replace: [[1, 0], [3, 1]] },
      { key: "guidance", replace: [[0, 2], [1, 3]] },
      { key: "t1-18", replace: [[7, 4]] },
    ]);
  });

  it("ページ数が合わなければ、内訳つきで知らせる", () => {
    const { plans, total } = signedReplacePlan([{ key: "a", pageCount: 2, signPages: [0, 1] }]);
    expect(signedPageCountMessage(plans, total, 2, (k) => k)).toBeNull();
    expect(signedPageCountMessage(plans, total, 1, (k) => k)).toContain("全部で2ページ（a 2ページ）");
  });
});
