import { describe, expect, it } from "vitest";
import {
  countInvoicesCreated,
  countRemindersSent,
  invoiceCreatedMap,
  isInvoiceCreated,
  reminderSentMap,
} from "./invoice-status";

describe("invoiceCreatedMap", () => {
  it("作成日が入っている機関だけを拾う", () => {
    const map = invoiceCreatedMap([
      { organization_id: "a", invoice_created_on: "2026-08-01" },
      { organization_id: "b", invoice_created_on: null },
    ]);
    expect(map).toEqual({ a: "2026-08-01" });
  });

  it("所属機関が空の記録は無視する", () => {
    expect(invoiceCreatedMap([{ organization_id: "", invoice_created_on: "2026-08-01" }])).toEqual(
      {},
    );
  });
});

describe("isInvoiceCreated", () => {
  const map = { a: "2026-08-01" };
  it("作成済みならtrue", () => {
    expect(isInvoiceCreated(map, "a")).toBe(true);
  });
  it("記録が無ければfalse", () => {
    expect(isInvoiceCreated(map, "b")).toBe(false);
  });
  it("所属機関が未設定ならfalse", () => {
    expect(isInvoiceCreated(map, "")).toBe(false);
  });
});

describe("countInvoicesCreated", () => {
  it("作成済み・全体・残りを数える", () => {
    expect(countInvoicesCreated(["a", "b", "c"], { a: "2026-08-01" })).toEqual({
      created: 1,
      total: 3,
      remaining: 2,
    });
  });

  it("所属機関が未設定の行は母数に入れない", () => {
    expect(countInvoicesCreated(["a", ""], { a: "2026-08-01" })).toEqual({
      created: 1,
      total: 1,
      remaining: 0,
    });
  });

  it("記録がひとつも無ければすべて未作成", () => {
    expect(countInvoicesCreated(["a", "b"], {})).toEqual({
      created: 0,
      total: 2,
      remaining: 2,
    });
  });
});

describe("reminderSentMap", () => {
  it("発行日が入っている機関だけを拾う", () => {
    expect(
      reminderSentMap([
        { organization_id: "a", reminder_sent_on: "2026-08-08" },
        { organization_id: "b", reminder_sent_on: null },
        { organization_id: "", reminder_sent_on: "2026-08-08" },
      ]),
    ).toEqual({ a: "2026-08-08" });
  });
});

describe("countRemindersSent", () => {
  it("督促状を出した機関の数を数える", () => {
    expect(countRemindersSent(["a", "b", "c"], { a: "2026-08-08", c: "2026-08-08" })).toBe(2);
  });

  it("出していなければ0", () => {
    expect(countRemindersSent(["a", "b"], {})).toBe(0);
  });

  it("所属機関が未設定の行は数えない", () => {
    expect(countRemindersSent(["", "a"], { a: "2026-08-08" })).toBe(1);
  });
});
