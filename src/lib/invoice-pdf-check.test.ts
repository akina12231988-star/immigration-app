import { describe, expect, it } from "vitest";
import {
  checkInvoiceLines,
  normalizeName,
  parseSupportLine,
  type PdfTextLine,
} from "./invoice-pdf-check";
import { billingRowFor, type BillingWorker } from "./monthly-billing";

const MONTH = "2026-07";

function worker(over: Partial<BillingWorker> & { name: string }): BillingWorker {
  return {
    id: over.name,
    kana: "",
    nationality: "ベトナム",
    gender: "男",
    birth: null,
    residence_status: "特定技能1号",
    residence_card_no: "",
    residence_permit_date: "2025-01-01",
    residence_expiry_date: null,
    employment_start_on: "2025-01-01",
    assigned_office: "",
    residence_note: "",
    recurring_sales_no: "",
    current_organization_id: "org-1",
    support: "支援対象",
    status: "在籍中",
    leaving_on: null,
    ...over,
  };
}

function line(text: string, over: Partial<PdfTextLine> = {}): PdfTextLine {
  return { page: 0, x: 60, y: 700, text, ...over };
}

// 名簿の1人分（氏名順に並べて渡すのは呼び出し側の責任）
function row(name: string, fee = 15000) {
  return billingRowFor(worker({ name }), MONTH, fee);
}

describe("parseSupportLine", () => {
  it("支援代・サポート代の行から氏名と明細金額を読む", () => {
    const l = parseSupportLine(line("CHEN SOLEUさん　特定活動　7月分のサポート代 1人 15,000 15,000"));
    expect(l?.name).toBe("CHEN SOLEU");
    expect(l?.amount).toBe(15000);

    const p = parseSupportLine(line("SOAM LINAさん　特定技能　7月10日からの支援代 1人 4,830 4,830"));
    expect(p?.name).toBe("SOAM LINA");
    expect(p?.amount).toBe(4830);
  });

  it("すでにNo.が書き込まれた行でも氏名を正しく読む", () => {
    const l = parseSupportLine(line("No.4 CHEN SOLEUさん　特定活動　7月分のサポート代 1人 15,000 15,000"));
    expect(l?.name).toBe("CHEN SOLEU");
    expect(l?.amount).toBe(15000);
  });

  it("支援代・サポート代でない行は対象外", () => {
    expect(parseSupportLine(line("SAM SREYLEAB　人材紹介手数料代 1人 30,000 30,000"))).toBeNull();
    expect(parseSupportLine(line("特定技能の更新申請代 5人 18,000 90,000"))).toBeNull();
    expect(parseSupportLine(line("請求金額 1,717,349円"))).toBeNull();
  });

  it("氏名の空白のゆれ（2つの空白・切れ方の違い）でも照合できる形にそろえる", () => {
    expect(normalizeName("VO  QUANG BEN")).toBe(normalizeName("VO QUANG BEN"));
    expect(normalizeName("CHEN SOL EU")).toBe(normalizeName("CHEN SOLEU"));
    expect(normalizeName(" chen soleu ")).toBe(normalizeName("CHEN SOLEU"));
  });
});

describe("checkInvoiceLines", () => {
  const roster = [row("BOEURN DANY"), row("CHEA SOPHARA"), row("CHEN SOLEU")];

  it("氏名順のNo.を振り、全員そろっていれば漏れなし", () => {
    const result = checkInvoiceLines(roster, [
      line("CHEN SOLEUさん　特定活動　7月分のサポート代 1人 15,000 15,000"),
      line("BOEURN DANYさん　特定技能　7月分の支援代 1人 15,000 15,000"),
      line("CHEA SOPHARAさん　特定技能　7月分の支援代 1人 15,000 15,000"),
    ]);
    expect(result.missing).toEqual([]);
    expect(result.unknown).toEqual([]);
    expect(result.matched.map((m) => [m.no, m.name])).toEqual([
      [3, "CHEN SOLEU"],
      [1, "BOEURN DANY"],
      [2, "CHEA SOPHARA"],
    ]);
  });

  it("請求書に無い人は漏れ、名簿に無い人は unknown になる", () => {
    const result = checkInvoiceLines(roster, [
      line("BOEURN DANYさん　特定技能　7月分の支援代 1人 15,000 15,000"),
      line("NGUYEN VAN Aさん　特定技能　7月分の支援代 1人 15,000 15,000"),
    ]);
    expect(result.missing.map((m) => [m.no, m.name])).toEqual([
      [2, "CHEA SOPHARA"],
      [3, "CHEN SOLEU"],
    ]);
    expect(result.unknown.map((u) => u.name)).toEqual(["NGUYEN VAN A"]);
  });

  it("請求額0円の人は請求書に無くても漏れにしない", () => {
    const result = checkInvoiceLines([row("BOEURN DANY", 0)], []);
    expect(result.missing).toEqual([]);
  });

  it("明細金額が名簿の請求額と違えば知らせる", () => {
    const result = checkInvoiceLines(roster, [
      line("BOEURN DANYさん　特定技能　7月分の支援代 1人 12,000 12,000"),
    ]);
    expect(result.matched[0].amountMismatch).toBe(true);
    expect(result.matched[0].rosterAmount).toBe(15000);
  });

  it("日割りの行は日割り額と比べる", () => {
    const prorated = billingRowFor(
      worker({ name: "SOAM LINA", residence_permit_date: "2026-07-10" }),
      MONTH,
      15000,
    );
    const result = checkInvoiceLines([prorated], [
      line(`SOAM LINAさん　特定技能　7月10日からの支援代 1人 ${prorated.amount.toLocaleString()} ${prorated.amount.toLocaleString()}`),
    ]);
    expect(result.matched[0].amountMismatch).toBe(false);
  });

  it("freee側の氏名に空白が2つあっても照合できる", () => {
    const result = checkInvoiceLines([row("VO QUANG BEN")], [
      line("VO  QUANG BENさん　特定活動　7月分のサポート代 1人 15,000 15,000"),
    ]);
    expect(result.matched.map((m) => m.no)).toEqual([1]);
    expect(result.missing).toEqual([]);
  });
});
