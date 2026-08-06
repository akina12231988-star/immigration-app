import { describe, expect, it } from "vitest";
import {
  remainingAmount,
  reminderLetterSheet,
  reminderTotal,
  type ReminderInvoiceRow,
} from "./reminder-letter";

const row = (patch: Partial<ReminderInvoiceRow>): ReminderInvoiceRow => ({
  billedOn: "2026-06-01",
  invoiceNo: "INV-0000001324",
  amount: 677393,
  paid: 0,
  dueOn: "2026-06-30",
  ...patch,
});

describe("督促状（未入金のご確認）", () => {
  it("残額 = 請求金額 − 入金済み額（マイナスにはしない）", () => {
    expect(remainingAmount(row({}))).toBe(677393);
    expect(remainingAmount(row({ amount: 100000, paid: 30000 }))).toBe(70000);
    expect(remainingAmount(row({ amount: 100000, paid: 120000 }))).toBe(0);
  });

  it("参考合計は未入金の残額と今回のご請求額の合算", () => {
    const total = reminderTotal({
      unpaid: [row({ amount: 100000, paid: 30000 }), row({ amount: 55000 })],
      current: row({ amount: 164400 }),
    });
    expect(total).toBe(70000 + 55000 + 164400);
  });

  it("シートに宛名・文面・一覧・参考合計が入る（一部入金は区分と入金済み額つき）", () => {
    const sheet = reminderLetterSheet({
      orgName: "井上洋介",
      honorific: "様",
      issuedOn: "2026-08-06",
      unpaid: [row({ amount: 100000, paid: 30000 })],
      current: row({
        billedOn: "2026-08-01",
        invoiceNo: "INV-0000001400",
        amount: 164400,
        dueOn: "2026-08-31",
      }),
    });
    const flat = sheet.rows.map((r) => r.join("|")).join("\n");
    expect(flat).toContain("井上洋介　様");
    expect(flat).toContain("未入金のお支払いについて");
    expect(flat).toContain("さて、6月1日付で発行いたしましたご請求書につきまして");
    expect(flat).toContain("一部ご入金をいただいている請求は");
    expect(flat).toContain("念の為、8月1日付で発行しております請求書分まで一覧に");
    // 一部入金の行: 入金済み30,000・残額70,000・区分 一部入金
    const partial = sheet.rows.find((r) => r[6] === "一部入金");
    expect(partial?.[2]).toBe(100000);
    expect(partial?.[3]).toBe(30000);
    expect(partial?.[4]).toBe(70000);
    // 今回の請求の行: 区分 請求中
    const current = sheet.rows.find((r) => r[6] === "請求中");
    expect(current?.[4]).toBe(164400);
    // 参考合計は合算（70,000 + 164,400）
    const total = sheet.rows.find((r) => String(r[0]).startsWith("参考合計"));
    expect(total?.[4]).toBe(234400);
  });

  it("未入金がすべて全額のままなら一部入金の文は入らない", () => {
    const sheet = reminderLetterSheet({
      orgName: "合同会社ファームサービス",
      honorific: "御中",
      issuedOn: "2026-08-06",
      unpaid: [row({})],
      current: null,
    });
    const flat = sheet.rows.map((r) => r.join("|")).join("\n");
    expect(flat).not.toContain("一部ご入金");
    expect(flat).toContain("合同会社ファームサービス　御中");
  });
});
