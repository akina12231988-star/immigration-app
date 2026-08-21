import { describe, expect, it } from "vitest";
import {
  applicationNumberDigits,
  findApplicationsByNumber,
  findDuplicateApplication,
  matchesApplicationNumber,
  normalizeApplicationNumber,
} from "./application-number";

describe("normalizeApplicationNumber", () => {
  it("最後の「号」を無視する", () => {
    expect(normalizeApplicationNumber("福熊E91138号")).toBe("福熊E91138");
    expect(normalizeApplicationNumber("福熊E91138")).toBe("福熊E91138");
  });

  it("前後・間の空白と全角英数をそろえる", () => {
    expect(normalizeApplicationNumber(" 福熊 Ｅ９１１３８ 号 ")).toBe("福熊E91138");
  });

  it("大文字小文字をそろえる", () => {
    expect(normalizeApplicationNumber("福熊e91138")).toBe("福熊E91138");
  });

  it("空欄は空のまま", () => {
    expect(normalizeApplicationNumber("")).toBe("");
  });
});

describe("findDuplicateApplication", () => {
  const apps = [
    { id: "1", applicationNumber: "福熊E91138号" },
    { id: "2", applicationNumber: "福熊E90001" },
  ];

  it("「号」の有無が違っても同じ番号として見つける", () => {
    expect(findDuplicateApplication(apps, "福熊E91138")?.id).toBe("1");
    expect(findDuplicateApplication(apps, "福熊 E91138 号")?.id).toBe("1");
  });

  it("別の番号なら見つからない", () => {
    expect(findDuplicateApplication(apps, "福熊E99999")).toBeUndefined();
  });

  it("自分自身は除く", () => {
    expect(findDuplicateApplication(apps, "福熊E91138号", "1")).toBeUndefined();
  });

  it("空欄では判定しない", () => {
    expect(findDuplicateApplication(apps, "   ")).toBeUndefined();
  });
});

describe("applicationNumberDigits", () => {
  it("数字の部分だけを取り出す", () => {
    expect(applicationNumberDigits("福熊C10685号")).toBe("10685");
    expect(applicationNumberDigits("福熊Ｅ９１１３８号")).toBe("91138");
  });

  it("数字が無ければ空", () => {
    expect(applicationNumberDigits("福熊")).toBe("");
    expect(applicationNumberDigits("")).toBe("");
  });
});

describe("matchesApplicationNumber", () => {
  const no = "福熊C10685号";

  it("数字だけでも見つかる（通知書から番号だけ読んだとき）", () => {
    expect(matchesApplicationNumber(no, "10685")).toBe(true);
  });

  it("そのままの番号でも、「号」を省いても見つかる", () => {
    expect(matchesApplicationNumber(no, "福熊C10685号")).toBe(true);
    expect(matchesApplicationNumber(no, "福熊C10685")).toBe(true);
  });

  it("全角・小文字・空白の違いは無視する", () => {
    expect(matchesApplicationNumber(no, "福熊ｃ１０６８５")).toBe(true);
    expect(matchesApplicationNumber(no, " 福熊 C10685 ")).toBe(true);
  });

  it("番号の一部でも見つかる", () => {
    expect(matchesApplicationNumber(no, "C10685")).toBe(true);
  });

  it("違う番号は見つからない", () => {
    expect(matchesApplicationNumber(no, "10686")).toBe(false);
    expect(matchesApplicationNumber(no, "福熊E10685")).toBe(false);
  });

  it("入力が空・番号が未登録なら見つからない", () => {
    expect(matchesApplicationNumber(no, "")).toBe(false);
    expect(matchesApplicationNumber("", "10685")).toBe(false);
  });
});

describe("findApplicationsByNumber", () => {
  const apps = [
    { applicationNumber: "福熊C10685号" },
    { applicationNumber: "福熊E10685号" },
    { applicationNumber: "福熊C106850号" },
    { applicationNumber: "福熊D22222号" },
  ];

  it("数字が同じものを全部返す（どれか判断できるように）", () => {
    expect(findApplicationsByNumber(apps, "10685").map((a) => a.applicationNumber)).toEqual([
      "福熊C10685号",
      "福熊E10685号",
      "福熊C106850号",
    ]);
  });

  it("ぴったり一致を先に出す", () => {
    expect(findApplicationsByNumber(apps, "福熊E10685").map((a) => a.applicationNumber)).toEqual([
      "福熊E10685号",
    ]);
  });

  it("見つからなければ空", () => {
    expect(findApplicationsByNumber(apps, "99999")).toEqual([]);
    expect(findApplicationsByNumber(apps, "")).toEqual([]);
  });
});
