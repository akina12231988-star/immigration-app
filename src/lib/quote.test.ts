import { describe, expect, it } from "vitest";
import {
  defaultQuoteItems,
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
      { name: "A", price: 12000, unit: "毎月", taxFree: false, note: "" },
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
