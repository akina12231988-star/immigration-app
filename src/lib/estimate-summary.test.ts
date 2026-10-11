import { describe, expect, it } from "vitest";
import { estimateHref, pickEstimateChecklist, workerSheetPrintHref } from "@/lib/estimate-summary";

const list = (todo: string, payer: string, updated: string) => ({
  todo_no: todo,
  app_content: "",
  app_type: "" as const,
  stamp_fee_payer: payer,
  updated_at: updated,
});

describe("見積書に使う準備リストの選び方", () => {
  it("負担が決まっているいちばん新しいリストを選ぶ", () => {
    const picked = pickEstimateChecklist(
      [list("TODO-1", "本人負担", "2026-09-01"), list("TODO-2", "", "2026-10-01"), list("TODO-3", "会社負担", "2026-09-15")],
      "サンプル農園",
    );
    expect(picked?.checklist.todo_no).toBe("TODO-3");
    expect(picked?.payer).toBe("会社負担");
  });

  it("負担がどれも決まっていなければ null", () => {
    expect(pickEstimateChecklist([list("TODO-1", "", "2026-09-01")], "サンプル農園")).toBeNull();
    expect(pickEstimateChecklist([], "サンプル農園")).toBeNull();
  });

  it("有限会社國崎青果は負担が未設定でも本人負担として選ぶ", () => {
    const picked = pickEstimateChecklist([list("TODO-1", "", "2026-09-01")], "有限会社國崎青果");
    expect(picked?.payer).toBe("本人負担");
  });

  it("リンク先", () => {
    expect(estimateHref("w1", "TODO-2114")).toBe("/workers/w1/application-prep/estimate?todo=TODO-2114");
    expect(workerSheetPrintHref("w1")).toBe("/workers/print?worker=w1");
  });
});
