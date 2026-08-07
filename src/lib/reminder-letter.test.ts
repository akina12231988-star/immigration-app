import { describe, expect, it } from "vitest";
import {
  buildReminderLetter,
  honorificFor,
  remainingAmount,
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

  it("会社・法人は御中、個人事業主は様", () => {
    expect(honorificFor("合同会社ファームサービス")).toBe("御中");
    expect(honorificFor("農事組合法人◯◯")).toBe("御中");
    expect(honorificFor("井上洋介")).toBe("様");
  });

  it("宛名・文面・一覧・参考合計が入る（一部入金は区分と入金済み額つき）", () => {
    const letter = buildReminderLetter({
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

    expect(letter.addressee).toBe("井上洋介　様");
    expect(letter.issuedOn).toBe("2026/08/06");
    expect(letter.title).toBe("未入金のお支払いについて");

    const text = letter.paragraphs.join("\n");
    expect(text).toContain("さて、6月1日付で発行いたしましたご請求書につきまして");
    expect(text).toContain("支払い期限を6月30日としておりましたが");
    expect(text).toContain("一部ご入金をいただいている請求は");
    expect(text).toContain("念の為、8月1日付で発行しております請求書分まで一覧に");

    // 一部入金の行: 入金済み30,000・残額70,000
    const partial = letter.rows.find((r) => r.kind === "一部入金");
    expect(partial).toMatchObject({ amount: 100000, paid: 30000, remaining: 70000 });
    expect(partial?.billedOn).toBe("2026/06/01");

    // 今回の請求は末尾に「請求中」で載る
    expect(letter.rows.at(-1)).toMatchObject({ kind: "請求中", remaining: 164400 });

    // 参考合計は合算（70,000 + 164,400）
    expect(letter.total).toBe(234400);
  });

  it("未入金は古い請求から順に並ぶ", () => {
    const letter = buildReminderLetter({
      orgName: "合同会社ファームサービス",
      honorific: "御中",
      issuedOn: "2026-08-06",
      unpaid: [
        row({ billedOn: "2026-07-01", dueOn: "2026-07-31", invoiceNo: "C" }),
        row({ billedOn: "2026-05-01", dueOn: "2026-05-31", invoiceNo: "A" }),
        row({ billedOn: "2026-06-01", dueOn: "2026-06-30", invoiceNo: "B" }),
      ],
      current: null,
    });
    expect(letter.rows.map((r) => r.invoiceNo)).toEqual(["A", "B", "C"]);
    // 本文では一番古い請求の日付を使う
    expect(letter.paragraphs.join("\n")).toContain("さて、5月1日付で発行いたしました");
  });

  it("未入金がすべて全額のままなら一部入金の文は入らない", () => {
    const letter = buildReminderLetter({
      orgName: "合同会社ファームサービス",
      honorific: "御中",
      issuedOn: "2026-08-06",
      unpaid: [row({})],
      current: null,
    });
    expect(letter.paragraphs.join("\n")).not.toContain("一部ご入金");
    expect(letter.addressee).toBe("合同会社ファームサービス　御中");
  });
});
