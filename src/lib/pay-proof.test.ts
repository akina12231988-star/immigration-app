import { describe, expect, it } from "vitest";
import { isCashPay, payProofFileName, payProofSheetCount } from "./pay-proof";

describe("isCashPay", () => {
  it("所属機関の給与支払い方法が通貨払いのときだけ true", () => {
    expect(isCashPay("通貨払い")).toBe(true);
    expect(isCashPay(" 通貨払い ")).toBe(true);
    expect(isCashPay("口座振込")).toBe(false);
    expect(isCashPay("")).toBe(false);
    expect(isCashPay(null)).toBe(false);
    expect(isCashPay(undefined)).toBe(false);
  });
});

describe("payProofSheetCount", () => {
  it("在留期間が1年以上なら12枚", () => {
    expect(payProofSheetCount("1年")).toBe(12);
    expect(payProofSheetCount("3年")).toBe(12);
    expect(payProofSheetCount("1年6月")).toBe(12);
    expect(payProofSheetCount("１年")).toBe(12); // 全角
  });

  it("1年に満たないなら6枚", () => {
    expect(payProofSheetCount("6月")).toBe(6);
    expect(payProofSheetCount("4月")).toBe(6);
    expect(payProofSheetCount("6ヶ月")).toBe(6);
  });

  it("12か月以上の月数表記は12枚", () => {
    expect(payProofSheetCount("12月")).toBe(12);
  });

  it("在留期間が未登録・読み取れないときは多い方（12枚）", () => {
    expect(payProofSheetCount("")).toBe(12);
    expect(payProofSheetCount(null)).toBe(12);
    expect(payProofSheetCount("特定活動")).toBe(12);
  });
});

describe("payProofFileName", () => {
  it("印刷のファイル名は「報酬支払証明書_氏名」", () => {
    expect(payProofFileName("TRAN THI BICH THAO")).toBe("報酬支払証明書_TRAN THI BICH THAO");
    // ファイル名に使えない文字は置き換える
    expect(payProofFileName("A/B")).toBe("報酬支払証明書_A-B");
    expect(payProofFileName("")).toBe("報酬支払証明書");
  });
});
