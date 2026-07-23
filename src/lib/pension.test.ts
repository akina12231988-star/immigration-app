import { describe, expect, it } from "vitest";
import { judgePension, parsePensionSymbols } from "./pension";

describe("judgePension", () => {
  it("未入力は none", () => {
    expect(judgePension([]).judgment).toBe("none");
    expect(judgePension([]).needsAction).toBe(false);
  });

  it("＊（未納）があれば支払い/免除申請アラート", () => {
    const r = judgePension(["A", "＊"]);
    expect(r.judgment).toBe("pay");
    expect(r.needsAction).toBe(true);
    expect(r.alert).toContain("支払い");
  });

  it("A（納付済み）のみは問題なし", () => {
    expect(judgePension(["A"]).judgment).toBe("ok");
    expect(judgePension(["A"]).needsAction).toBe(false);
  });

  it("免除区分（全額免除・納付猶予）のみは対応済み", () => {
    expect(judgePension(["A", "L", "セ"]).judgment).toBe("exempt");
  });

  it("半額免除期間の未納（ア）も未納として要対応", () => {
    expect(judgePension(["A", "ア"]).judgment).toBe("pay");
  });

  it("時効未納/未加入（-・/）のみは要確認", () => {
    expect(judgePension(["A", "-", "/"]).judgment).toBe("check");
  });
});

describe("parsePensionSymbols", () => {
  it("既知の記号のみ抽出する", () => {
    expect(parsePensionSymbols("A, ＊, 不明")).toEqual(["A", "＊"]);
  });
});
