import { describe, expect, it } from "vitest";
import { formatAmountInput, stripAmountCommas } from "./amount-format";
import { parseAmount } from "./organization-intake";
import { parseYen } from "./dependents";

describe("formatAmountInput", () => {
  it("数字だけのときは3桁ごとに「,」を入れる", () => {
    expect(formatAmountInput("150000")).toBe("150,000");
    expect(formatAmountInput("1000")).toBe("1,000");
    expect(formatAmountInput("999")).toBe("999");
    expect(formatAmountInput("15000000")).toBe("15,000,000");
  });

  it("すでに「,」が入っていても入れ直す（打ち直しの途中でも崩れない）", () => {
    expect(formatAmountInput("1,5000")).toBe("15,000");
    expect(formatAmountInput("150,000")).toBe("150,000");
  });

  it("全角数字は半角にしてから「,」を入れる", () => {
    expect(formatAmountInput("６０，０００")).toBe("60,000");
  });

  it("文字が混じっているものは打ったままにする（「無し」など自由に書ける欄のため）", () => {
    expect(formatAmountInput("無し")).toBe("無し");
    expect(formatAmountInput("なし")).toBe("なし");
    expect(formatAmountInput("約1万円")).toBe("約1万円");
    expect(formatAmountInput("150,000円")).toBe("150,000円");
  });

  it("空・未入力はそのまま空", () => {
    expect(formatAmountInput("")).toBe("");
    expect(formatAmountInput(null)).toBe("");
    expect(formatAmountInput(undefined)).toBe("");
  });

  it("数値で渡すこともできる（0は未入力として空にする）", () => {
    expect(formatAmountInput(250000)).toBe("250,000");
    expect(formatAmountInput(0)).toBe("");
  });

  it("小数はそのまま後ろに付ける（率などの欄でも壊れない）", () => {
    expect(formatAmountInput("1234.56")).toBe("1,234.56");
    expect(formatAmountInput("9.85")).toBe("9.85");
  });
});

describe("stripAmountCommas", () => {
  it("「,」だけを取り除く", () => {
    expect(stripAmountCommas("150,000")).toBe("150000");
    expect(stripAmountCommas("150,000円")).toBe("150000円");
  });
});

describe("「,」入りで保存しても金額の読み取りは変わらない", () => {
  it("parseAmount・parseYen は「,」を無視して数値にする", () => {
    expect(parseAmount(formatAmountInput("150000"))).toBe(150000);
    expect(parseYen(formatAmountInput("380000"))).toBe(380000);
    // 賃金計算（wage-calc）と同じ「数字以外を落として数値にする」読み方でも同じ
    expect(Number(stripAmountCommas(formatAmountInput("250000")).replace(/[^0-9]/g, ""))).toBe(
      250000,
    );
  });
});
