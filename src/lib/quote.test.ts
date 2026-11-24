import { describe, expect, it } from "vitest";
import {
  defaultQuoteItems,
  latestOnlineFee,
  newQuoteItemRow,
  newQuoteTextRow,
  onlineFeeWithCharge,
  printedQuoteItems,
  nextQuoteNumber,
  normalizeQuoteEvents,
  normalizeQuoteItems,
  normalizeQuoteRow,
  quoteAddressee,
  quoteMatches,
  quotePriceText,
} from "./quote";

describe("見積書（新規のお客様）", () => {
  it("既定の項目に変更申請・事前ガイダンス・生活オリエン・毎月の支援代・更新・印紙代・保険・紹介手数料が入る", () => {
    const names = defaultQuoteItems().map((i) => i.name).join("／");
    for (const w of ["在留資格変更許可申請", "事前ガイダンス", "生活オリエンテーション", "毎月の支援代", "更新許可申請", "収入印紙代", "特定技能総合保険", "人材紹介手数料"]) {
      expect(names).toContain(w);
    }
    const stamp = defaultQuoteItems().find((i) => i.name.includes("収入印紙代"));
    expect(stamp?.price).toBeNull();
    expect(stamp?.taxFree).toBe(true);
  });

  it("金額は税抜で、空欄は「—」", () => {
    expect(quotePriceText(78500)).toBe("78,500円");
    expect(quotePriceText(null)).toBe("—");
  });

  it("項目をそろえる（文字の金額も読む・壊れた行は捨てる）", () => {
    expect(normalizeQuoteItems([{ name: "A", price: "１２,０００円", unit: "毎月" }, null, 3])).toEqual([
      { kind: "item", on: true, name: "A", price: 12000, unit: "毎月", taxFree: false, note: "" },
    ]);
    expect(normalizeQuoteItems("x")).toEqual([]);
  });

  it("やりとりは新しい日付が上", () => {
    const ev = normalizeQuoteEvents([
      { id: "a", on: "2026-11-01", kind: "送付", body: "" },
      { id: "b", on: "2026-11-20", kind: "電話", body: "" },
    ]);
    expect(ev.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("宛先: 会社は御中＋担当者 様、個人は様だけ", () => {
    expect(quoteAddressee("株式会社テスト", "代表取締役 山田太郎")).toEqual({
      orgLine: "株式会社テスト 御中",
      personLine: "代表取締役 山田太郎 様",
    });
    expect(quoteAddressee("西田祐一", "西田祐一")).toEqual({ orgLine: "西田祐一 様", personLine: "" });
  });

  it("敬称を選べる（御中・様・なし）", () => {
    expect(quoteAddressee("和田", "", "御中")).toEqual({ orgLine: "和田 御中", personLine: "" });
    expect(quoteAddressee("株式会社テスト", "", "様")).toEqual({ orgLine: "株式会社テスト 様", personLine: "" });
    expect(quoteAddressee("株式会社テスト", "山田太郎", "様")).toEqual({ orgLine: "株式会社テスト", personLine: "山田太郎 様" });
    expect(quoteAddressee("株式会社テスト", "山田太郎", "なし")).toEqual({ orgLine: "株式会社テスト", personLine: "山田太郎" });
  });

  it("チェックを外した行と空の文字の行は印字しない", () => {
    const items = [
      { ...newQuoteItemRow(), name: "A" },
      { ...newQuoteItemRow(), name: "B", on: false },
      newQuoteTextRow("■ 見出し"),
      newQuoteTextRow(""),
    ];
    expect(printedQuoteItems(items).map((i) => i.name)).toEqual(["A", "■ 見出し"]);
    expect(normalizeQuoteItems([{ kind: "text", name: "x", on: false }])[0]).toMatchObject({ kind: "text", on: false });
  });

  it("印紙代の表のオンラインは決済手数料込み・次の見積書に引き継ぐ", () => {
    expect(onlineFeeWithCharge(27000, 330)).toBe(27330);
    expect(onlineFeeWithCharge(27000, null)).toBe(27000);
    const a = normalizeQuoteRow({ id: "a", online_fee: null });
    const b = normalizeQuoteRow({ id: "b", online_fee: 330, honorific: "様", attachment_ids: ["x", 1] });
    expect(latestOnlineFee([a, b])).toBe(330);
    expect(b.honorific).toBe("様");
    expect(b.attachment_ids).toEqual(["x"]);
  });

  it("見積書番号は同じ日の続き番号", () => {
    expect(nextQuoteNumber("2026-11-23", [])).toBe("M-20261123-1");
    expect(nextQuoteNumber("2026-11-23", ["M-20261123-1", "M-20261123-3", "M-20261122-9"])).toBe("M-20261123-4");
  });

  it("検索は会社名・やりとりの中身も見る", () => {
    const q = normalizeQuoteRow({ id: "1", addressee_name: "株式会社A", events: [{ id: "e", on: "2026-11-01", kind: "電話", body: "2名検討中" }] });
    expect(quoteMatches(q, "検討")).toBe(true);
    expect(quoteMatches(q, "株式会社B")).toBe(false);
    expect(q.status).toBe("作成中");
    expect(q.show_stamp_table).toBe(true);
  });
});
