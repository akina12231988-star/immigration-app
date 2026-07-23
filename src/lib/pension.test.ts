import { describe, expect, it } from "vitest";
import { judgePension, parsePensionSymbols } from "./pension";

describe("judgePension", () => {
  it("未入力は none", () => {
    expect(judgePension([]).judgment).toBe("none");
    expect(judgePension([]).needsAction).toBe(false);
  });

  it("未納があれば最優先で支払い/免除申請アラート", () => {
    const r = judgePension(["納", "未", "全免"]);
    expect(r.judgment).toBe("pay");
    expect(r.needsAction).toBe(true);
    expect(r.alert).toContain("支払い");
  });

  it("免除・猶予のみは対応済み（要対応ではない）", () => {
    const r = judgePension(["納", "全免", "猶予"]);
    expect(r.judgment).toBe("exempt");
    expect(r.needsAction).toBe(false);
  });

  it("未加入のみは要確認", () => {
    expect(judgePension(["納", "未加入"]).judgment).toBe("check");
  });

  it("納付済み等のみは問題なし", () => {
    expect(judgePension(["納", "厚", "3号"]).judgment).toBe("ok");
  });
});

describe("parsePensionSymbols", () => {
  it("既知の記号のみ抽出する", () => {
    expect(parsePensionSymbols("納, 未, 不明, 全免")).toEqual(["納", "未", "全免"]);
  });
});
