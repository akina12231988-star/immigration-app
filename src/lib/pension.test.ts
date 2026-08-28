import { describe, expect, it } from "vitest";
import {
  addMonth,
  assignPastedCodes,
  judgePension,
  normalizePensionCode,
  parseMonthCodes,
  parsePensionSymbols,
  pensionMonths,
  pensionSymbolByCode,
  summarizeMonths,
  warekiMonthLabel,
  PENSION_SYMBOLS,
} from "./pension";

describe("PENSION_SYMBOLS（記録票の凡例）", () => {
  it("記号が重複していない", () => {
    const codes = PENSION_SYMBOLS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("凡例の記号がひととおり入っている", () => {
    for (const code of ["A", "*", "/", "Y", "Z", "サ", "セ", "ア", "チ", "ヒ", "$", "+", "&", "#", "-"]) {
      expect(pensionSymbolByCode(code), code).toBeDefined();
    }
    expect(pensionSymbolByCode("A")!.meaning).toBe("定額保険料");
    expect(pensionSymbolByCode("/")!.meaning).toContain("無資格");
    expect(pensionSymbolByCode("Z")!.meaning).toBe("申請免除（全額）");
  });
});

describe("normalizePensionCode", () => {
  it("全角の記号を半角にそろえる", () => {
    expect(normalizePensionCode("＊")).toBe("*");
    expect(normalizePensionCode("／")).toBe("/");
    expect(normalizePensionCode("＋")).toBe("+");
  });

  it("小文字の英字は大文字にする", () => {
    expect(normalizePensionCode("a")).toBe("A");
  });

  it("以前使っていた ￥ は A として扱う", () => {
    expect(normalizePensionCode("￥")).toBe("A");
  });

  it("知らない記号は空文字", () => {
    expect(normalizePensionCode("あ")).toBe("");
    expect(normalizePensionCode(" ")).toBe("");
  });
});

describe("judgePension", () => {
  it("未入力は none", () => {
    expect(judgePension([]).judgment).toBe("none");
    expect(judgePension([]).needsAction).toBe(false);
  });

  it("*（未納）があれば支払い/免除申請アラート", () => {
    const r = judgePension(["A", "*"]);
    expect(r.judgment).toBe("pay");
    expect(r.needsAction).toBe(true);
    expect(r.alert).toContain("支払い");
  });

  it("A（定額保険料）のみは問題なし", () => {
    expect(judgePension(["A"]).judgment).toBe("ok");
    expect(judgePension(["A"]).needsAction).toBe(false);
  });

  it("免除区分（法定免除・納付猶予）のみは対応済み", () => {
    expect(judgePension(["A", "Y", "セ"]).judgment).toBe("exempt");
  });

  it("半額免除期間の未納（ア）も未納として要対応", () => {
    expect(judgePension(["A", "ア"]).judgment).toBe("pay");
  });

  it("第3号未納（-）・特定期間未納（&）も未納あつかい", () => {
    expect(judgePension(["A", "-"]).judgment).toBe("pay");
    expect(judgePension(["A", "&"]).judgment).toBe("pay");
  });

  it("無資格（/）・記録未切替（#）のみは要確認", () => {
    expect(judgePension(["A", "/", "#"]).judgment).toBe("check");
  });

  it("知らない記号は判定に混ぜない", () => {
    expect(judgePension(["あ"]).judgment).toBe("none");
  });
});

describe("parsePensionSymbols", () => {
  it("既知の記号のみ抽出し、全角も拾う", () => {
    expect(parsePensionSymbols("A, ＊, 不明")).toEqual(["A", "*"]);
  });
});

describe("addMonth", () => {
  it("月をまたいで足し引きできる", () => {
    expect(addMonth("2026-08", -2)).toBe("2026-06");
    expect(addMonth("2026-01", -1)).toBe("2025-12");
    expect(addMonth("2025-12", 1)).toBe("2026-01");
  });
  it("形が違えば空文字", () => {
    expect(addMonth("", -1)).toBe("");
  });
});

describe("pensionMonths（申請月の2か月前までの24か月）", () => {
  it("申請月の2か月前を最後に24か月ぶんを古い順に返す", () => {
    const months = pensionMonths("2026-08");
    expect(months).toHaveLength(24);
    expect(months[23]).toBe("2026-06"); // 申請月の2か月前
    expect(months[0]).toBe("2024-07");
  });

  it("年をまたいでも並びが崩れない", () => {
    const months = pensionMonths("2026-01");
    expect(months[23]).toBe("2025-11");
    expect(months[0]).toBe("2023-12");
  });

  it("申請月が未入力なら空", () => {
    expect(pensionMonths("")).toEqual([]);
  });
});

describe("warekiMonthLabel", () => {
  it("令和・平成・昭和に変換する", () => {
    expect(warekiMonthLabel("2026-06")).toBe("令和8年6月");
    expect(warekiMonthLabel("2018-03")).toBe("平成30年3月");
    expect(warekiMonthLabel("1980-01")).toBe("昭和55年1月");
  });
});

describe("assignPastedCodes（まとめて入力）", () => {
  it("記録票の並びを古い月から順に割り当てる", () => {
    const months = pensionMonths("2026-08");
    const codes = assignPastedCodes("AAA AAA AAA AAA AAA AAA AAA A/*", months);
    expect(Object.keys(codes)).toHaveLength(24);
    expect(codes["2024-07"]).toBe("A");
    expect(codes["2026-05"]).toBe("/");
    expect(codes["2026-06"]).toBe("*");
  });

  it("全角の記号・区切りの空白や改行を読み飛ばす", () => {
    const months = pensionMonths("2026-08");
    const codes = assignPastedCodes("Ａ　＊\n／", months);
    expect(codes["2024-07"]).toBe("A");
    expect(codes["2024-08"]).toBe("*");
    expect(codes["2024-09"]).toBe("/");
  });

  it("月数より多い記号は切り捨てる", () => {
    const codes = assignPastedCodes("AAAAA", ["2026-05", "2026-06"]);
    expect(Object.keys(codes)).toEqual(["2026-05", "2026-06"]);
  });
});

describe("parseMonthCodes（保存した月ごとの記号の読み込み）", () => {
  it("年月の形と既知の記号だけ残す", () => {
    expect(parseMonthCodes({ "2026-06": "A", "2026-07": "あ", ほか: "A", "2026-08": "＊" })).toEqual({
      "2026-06": "A",
      "2026-08": "*",
    });
  });

  it("null や配列は空", () => {
    expect(parseMonthCodes(null)).toEqual({});
    expect(parseMonthCodes("A")).toEqual({});
  });
});

describe("summarizeMonths", () => {
  it("入力済みの月数と、未納の月を返す", () => {
    const months = pensionMonths("2026-08");
    const codes = { "2024-07": "A", "2024-08": "*", "2026-06": "ア" };
    const s = summarizeMonths(codes, months);
    expect(s.total).toBe(24);
    expect(s.filled).toBe(3);
    expect(s.payMonths).toEqual(["2024-08", "2026-06"]);
  });
});
