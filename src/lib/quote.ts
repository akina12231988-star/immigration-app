// 見積書（新規のお客様向けの料金の一覧）。0235_quotes.sql
//
// 申請準備の見積書（lib/estimate.ts）は1人の申請の費用を合計して出すが、こちらは新規のお客様に
// 「どの手続きにいくらかかるか」を項目ごとに一覧にする。合計金額は出さず、金額は税抜で書く。
// 宛先は登録済みの所属機関でも、まだ登録していない会社（名前を手で入力）でもよい。
// 項目はほかの会社の見積書から複製でき、発行した見積書とその後のやりとり（送付・電話・訪問など）を記録する。

import { honorificFor } from "@/lib/reminder-letter";
import {
  REFERRAL_SALES_ITEMS,
  SSW_INSURANCE_AMOUNT,
  SSW_NEW_COMMON_ITEMS,
  SSW_NEW_FEE_STANDARD,
  SSW_NEW_SALES_ITEM_NAME,
  SSW_RENEWAL_SALES_ITEM,
} from "@/lib/sales";
import { parseAmount } from "@/lib/organization-intake";

export const QUOTE_MIGRATION = "0235_quotes.sql";

// 見積書の状況
export const QUOTE_STATUSES = ["作成中", "送付済", "検討中", "受注", "見送り"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// やりとりの種類
export const QUOTE_EVENT_KINDS = ["送付", "電話", "メール", "訪問", "打合せ", "LINE", "その他"] as const;

// 単位の候補（自由に入力もできる）
export const QUOTE_UNITS = ["1人あたり", "1人・毎月", "1件あたり", "1人・1年", "実費"] as const;

export interface QuoteItem {
  name: string;
  price: number | null; // 税抜の金額（null = 空欄。「実費」「別途」のときなど）
  unit: string;
  taxFree: boolean; // 非課税（収入印紙代・保険料）
  note: string; // 項目ごとの補足（いつかかるか など）
}

export interface QuoteEvent {
  id: string;
  on: string; // YYYY-MM-DD
  kind: string;
  body: string;
}

export interface QuoteRow {
  id: string;
  organization_id: string | null;
  addressee_name: string;
  addressee_person: string;
  addressee_address: string;
  issued_on: string | null;
  number: string;
  subject: string;
  items: QuoteItem[];
  notes: string;
  show_stamp_table: boolean;
  status: string;
  events: QuoteEvent[];
  created_at: string;
  updated_at: string;
}

export const QUOTE_DEFAULT_SUBJECT = "特定技能外国人の受入れ・支援に係る費用";

export const QUOTE_DEFAULT_NOTES = [
  "金額はすべて税抜です。別途消費税（10%）がかかります（非課税の項目を除く）。",
  "人数・申請の内容により、金額が変わる場合があります。",
  "本見積書の有効期限は発行日から3か月です。",
].join("\n");

// 新しい見積書の既定の項目（金額は画面で直せる）
export function defaultQuoteItems(): QuoteItem[] {
  const item = (name: string, price: number | null, unit: string, note = "", taxFree = false): QuoteItem => ({
    name,
    price,
    unit,
    taxFree,
    note,
  });
  return [
    item(SSW_NEW_SALES_ITEM_NAME, Number(SSW_NEW_FEE_STANDARD), "1人あたり", "特定技能への在留資格変更のとき"),
    ...SSW_NEW_COMMON_ITEMS.map((r) => item(r.name, Number(r.amount), "1人あたり", "変更申請のとき")),
    item("特定技能外国人の支援委託費（毎月の支援代）", null, "1人・毎月", "許可後、毎月"),
    item(SSW_RENEWAL_SALES_ITEM.name, Number(SSW_RENEWAL_SALES_ITEM.amount), "1人あたり", "在留期間の更新のとき"),
    item("収入印紙代（申請手数料）", null, "実費", "許可される在留期間により10,000円〜75,000円（下の表）", true),
    item("特定技能総合保険", SSW_INSURANCE_AMOUNT, "1人・1年", "会社負担のとき", true),
    ...REFERRAL_SALES_ITEMS.map((r) => item(r.name, Number(r.amount), "1人あたり", "人材のご紹介のとき")),
  ];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// DB の items（jsonb）を画面で使う形にそろえる
export function normalizeQuoteItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const p = r.price;
      const price =
        typeof p === "number" && Number.isFinite(p) ? Math.max(0, Math.round(p)) : typeof p === "string" ? parseAmount(p) : null;
      return { name: str(r.name), price: price ?? null, unit: str(r.unit), taxFree: r.taxFree === true, note: str(r.note) };
    });
}

// DB の events（jsonb）を画面で使う形にそろえる（新しい日付が上）
export function normalizeQuoteEvents(raw: unknown): QuoteEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({ id: str(r.id) || `e${i}`, on: str(r.on), kind: str(r.kind), body: str(r.body) }))
    .sort((a, b) => (a.on === b.on ? 0 : a.on < b.on ? 1 : -1));
}

export function normalizeQuoteRow(raw: Record<string, unknown>): QuoteRow {
  return {
    id: str(raw.id),
    organization_id: typeof raw.organization_id === "string" ? raw.organization_id : null,
    addressee_name: str(raw.addressee_name),
    addressee_person: str(raw.addressee_person),
    addressee_address: str(raw.addressee_address),
    issued_on: typeof raw.issued_on === "string" ? raw.issued_on : null,
    number: str(raw.number),
    subject: str(raw.subject),
    items: normalizeQuoteItems(raw.items),
    notes: str(raw.notes),
    show_stamp_table: raw.show_stamp_table !== false,
    status: str(raw.status) || "作成中",
    events: normalizeQuoteEvents(raw.events),
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
  };
}

// 宛先の1行目（会社名＋御中/様）と担当者の行（〇〇 様）
export function quoteAddressee(name: string, person: string): { orgLine: string; personLine: string } {
  const n = name.trim();
  const honorific = n ? honorificFor(n) : "";
  const p = person.trim();
  return {
    orgLine: n ? `${n} ${honorific}` : "",
    personLine: p && honorific === "御中" ? `${p} 様` : "",
  };
}

// 金額の表示（税抜）。空欄は「—」、0円は「0円」
export function quotePriceText(price: number | null): string {
  return price == null ? "—" : `${price.toLocaleString("ja-JP")}円`;
}

// 見積書番号の候補（見積日＋同じ日の何通目か。例: M-20261123-2）
export function nextQuoteNumber(issuedOn: string, existing: string[]): string {
  const ymd = issuedOn.replace(/-/g, "");
  const prefix = `M-${ymd}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const k = Number(n.slice(prefix.length));
    if (Number.isInteger(k) && k > max) max = k;
  }
  return `${prefix}${max + 1}`;
}

// 一覧の検索（会社名・担当者・件名・番号・やりとりの中身）
export function quoteMatches(q: QuoteRow, query: string): boolean {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  return [q.addressee_name, q.addressee_person, q.subject, q.number, ...q.events.map((e) => e.body)]
    .join("\n")
    .toLowerCase()
    .includes(s);
}

// いちばん新しいやりとり（一覧に出す）
export function latestQuoteEvent(q: QuoteRow): QuoteEvent | null {
  return q.events[0] ?? null;
}
