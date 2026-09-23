import { describe, expect, it } from "vitest";
import {
  isBankTransferPay,
  isCashPay,
  payProofFileName,
  payProofRange,
  payProofSheetCount,
  payProofStartMonth,
} from "./pay-proof";

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

describe("isBankTransferPay", () => {
  it("給与支払い方法が口座振込のときだけ true", () => {
    expect(isBankTransferPay("口座振込")).toBe(true);
    expect(isBankTransferPay(" 口座振込 ")).toBe(true);
    expect(isBankTransferPay("通貨払い")).toBe(false);
    expect(isBankTransferPay("")).toBe(false);
    expect(isBankTransferPay(null)).toBe(false);
  });
});

describe("payProofRange", () => {
  it("開始月〜在留期限日の月まで、両端の月も1枚ずつ数える", () => {
    expect(payProofRange("2026-09-01", "2028-01-27")).toEqual({
      count: 17,
      label: "2026年9月分〜2028年1月分",
    });
    expect(payProofRange("2026-09", "2026-09-30")).toEqual({ count: 1, label: "2026年9月分〜2026年9月分" });
  });
  it("読み取れない・期限が開始より前なら null", () => {
    expect(payProofRange("", "2028-01-27")).toBeNull();
    expect(payProofRange("2026-09", null)).toBeNull();
    expect(payProofRange("2026-09", "2026-08-31")).toBeNull();
  });
});

describe("payProofStartMonth", () => {
  it("雇用開始がこれからなら雇用開始の月、すでに働いていれば今月", () => {
    expect(payProofStartMonth("2026-09-23", "2026-11-01")).toBe("2026-11");
    expect(payProofStartMonth("2026-09-23", "2025-04-01")).toBe("2026-09");
    expect(payProofStartMonth("2026-09-23", null)).toBe("2026-09");
  });
});
