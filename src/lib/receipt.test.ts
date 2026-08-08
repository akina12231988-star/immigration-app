import { describe, expect, it } from "vitest";
import { buildReceipt, receiptAmountText, receiptDateText, receiptFileName } from "./receipt";

describe("領収書", () => {
  it("金額は3桁区切りで「¥55,000-」の形", () => {
    expect(receiptAmountText(55000)).toBe("¥55,000-");
    expect(receiptAmountText(677393)).toBe("¥677,393-");
    expect(receiptAmountText(0)).toBe("¥0-");
    // マイナスは0として扱う（領収書に負の金額は出さない）
    expect(receiptAmountText(-100)).toBe("¥0-");
  });

  it("日付は和式の表記", () => {
    expect(receiptDateText("2026-08-07")).toBe("2026年8月7日");
    expect(receiptDateText("2026-12-31")).toBe("2026年12月31日");
    expect(receiptDateText("")).toBe("");
  });

  it("宛名・但し書き・発行日・発行者が入る", () => {
    const r = buildReceipt({
      orgName: "有限会社　國崎青果",
      honorific: "御中",
      month: "2026-07",
      invoiceNo: "INV-0000001413",
      amount: 55000,
      paidOn: "2026-08-07",
      invoiceAmountExcl: 50000,
      invoiceTax: 5000,
      invoiceAmount: 55000,
    });
    expect(r.addressee).toBe("有限会社　國崎青果　御中");
    expect(r.amountText).toBe("¥55,000-");
    expect(r.purpose).toBe("2026年7月分 支援費として");
    expect(r.issuedOn).toBe("2026年8月7日");
    expect(r.issuer.name).toBe("登録支援機関 VUONG VAN THANH");
    expect(r.issuer.registrationNo).toBe("20登-005746");
    // 適格請求書発行事業者（インボイス）登録番号
    expect(r.issuer.invoiceRegistrationNo).toBe("T3810864134633");
    // 全額入金なので内消費税額を載せる
    expect(r.taxText).toBe("（内消費税額 ¥5,000-／税抜 ¥50,000-）");
  });

  it("一部入金では内消費税額を載せない（請求書の税額をそのまま書けないため）", () => {
    const r = buildReceipt({
      orgName: "有限会社　國崎青果",
      honorific: "御中",
      month: "2026-07",
      invoiceNo: "INV-0000001413",
      amount: 30000, // 55,000円の請求に対して一部だけ入金
      paidOn: "2026-08-07",
      invoiceAmountExcl: 50000,
      invoiceTax: 5000,
      invoiceAmount: 55000,
    });
    expect(r.amountText).toBe("¥30,000-");
    expect(r.taxText).toBeNull();
  });

  it("内訳が入っていなければ内消費税額を載せない", () => {
    const r = buildReceipt({
      orgName: "井上洋介",
      honorific: "様",
      month: "2026-07",
      invoiceNo: "",
      amount: 55000,
      paidOn: "2026-08-07",
      invoiceAmountExcl: 0,
      invoiceTax: 0,
      invoiceAmount: 55000,
    });
    expect(r.taxText).toBeNull();
  });

  it("発行日は入金日（請求日ではない）", () => {
    const r = buildReceipt({
      orgName: "井上洋介",
      honorific: "様",
      month: "2026-05",
      invoiceNo: "",
      amount: 89620,
      paidOn: "2026-08-20", // 5月分を8月20日に入金
      invoiceAmountExcl: 81473,
      invoiceTax: 8147,
      invoiceAmount: 89620,
    });
    expect(r.issuedOn).toBe("2026年8月20日");
    expect(r.purpose).toBe("2026年5月分 支援費として");
  });

  it("ファイル名に機関名と対象月が入る", () => {
    expect(receiptFileName("有限会社　國崎青果", "2026-07")).toBe(
      "領収書_有限会社　國崎青果_2026年7月",
    );
  });
});
