import { describe, expect, it } from "vitest";
import { buildPermitInvoice, permitInvoiceText, type PermitInvoiceBrief } from "./permit-invoice";

const brief = (p: Partial<PermitInvoiceBrief>): PermitInvoiceBrief => ({
  todo_no: "26-100",
  app_content: "特定技能更新の準備中",
  app_type: "更新",
  stamp_fee_payer: "",
  updated_at: "2026-11-01",
  estimate_items: null,
  ...p,
});

describe("buildPermitInvoice（当月許可者リストの許可の明細）", () => {
  it("申請準備で登録した明細を使い、会社負担なら実際の印紙代を非課税で足す", () => {
    const inv = buildPermitInvoice({
      briefs: [brief({ stamp_fee_payer: "会社負担", estimate_items: [{ name: "申請取次支援業務費", amount: "18000" }] })],
      orgName: "株式会社さくら",
      intake: null,
      stampFeeAmount: 27000,
    });
    expect(inv.source).toBe("prep");
    expect(inv.lines).toEqual([
      { name: "申請取次支援業務費", amount: 18000, taxable: true, kind: "sales" },
      { name: "収入印紙代（申請手数料）", amount: 27000, taxable: false, kind: "stamp" },
    ]);
    expect(inv.total).toBe(45000);
  });

  it("本人負担は印紙代を入れず備考に「印紙代は本人負担です。」", () => {
    const inv = buildPermitInvoice({
      briefs: [brief({ stamp_fee_payer: "本人負担" })],
      orgName: "株式会社さくら",
      intake: null,
      stampFeeAmount: 27000,
    });
    expect(inv.source).toBe("org");
    expect(inv.lines.some((l) => l.kind === "stamp")).toBe(false);
    expect(inv.notes).toEqual(["印紙代は本人負担です。"]);
    expect(permitInvoiceText("NGUYEN VAN A", inv)).toContain("印紙代は本人負担です。");
  });

  it("6,000円は負担が未設定・本人負担でも会社負担で入れる", () => {
    const inv = buildPermitInvoice({ briefs: [brief({ stamp_fee_payer: "本人負担" })], orgName: "X", intake: null, stampFeeAmount: 6000 });
    expect(inv.lines.find((l) => l.kind === "stamp")?.amount).toBe(6000);
    expect(inv.payer).toBe("会社負担");
  });

  it("負担が未設定なら所属機関の情報で選んだ負担を使う（会社立替は明細に入れて備考に立替）", () => {
    const inv = buildPermitInvoice({
      briefs: [brief({})],
      orgName: "X",
      intake: { stamp_fee_payer: "会社立替" },
      stampFeeAmount: 27000,
    });
    expect(inv.lines.find((l) => l.kind === "stamp")?.name).toContain("会社立替");
    expect(inv.notes[0]).toContain("会社立替");
  });

  it("申請準備が無ければ明細なし・印紙代未入力", () => {
    const inv = buildPermitInvoice({ briefs: [], orgName: "X", intake: null, stampFeeAmount: null });
    expect(inv.source).toBe("none");
    expect(inv.lines).toEqual([]);
    expect(inv.stamp.state).toBe("unknown_amount");
  });
});
