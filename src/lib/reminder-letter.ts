// 督促状（未入金のお支払いのご確認）の文面と一覧表を組み立てる。
// 弊社テンプレート「先月分が未入金の場合」の文面を再現し、
// 未入金（一部入金を含む）の請求と今回の請求をまとめた一覧と、
// 合算の参考合計（未入金の残額＋今回のご請求額）を載せる。
// 出来上がった内容は A4 の印刷用ページ（/sales/reminder）で表示する。

// 一覧の1行分（未入金・一部入金・今回の請求）
export interface ReminderInvoiceRow {
  billedOn: string; // 請求日 YYYY-MM-DD
  invoiceNo: string; // 請求書番号（freeeのINV-…）
  amount: number; // 請求金額
  paid: number; // 入金済み額（一部入金。0なら未入金）
  dueOn: string; // 支払期限 YYYY-MM-DD
}

export interface ReminderLetterInput {
  orgName: string; // 宛名（所属機関名）
  honorific: string; // 敬称（様 / 御中）
  issuedOn: string; // 発行年月日 YYYY-MM-DD
  unpaid: ReminderInvoiceRow[]; // 未入金・一部入金の請求（古い順に表示）
  current: ReminderInvoiceRow | null; // 今回（対象月）の請求。区分は「請求中」
}

// 一覧表の1行（表示用に整えたもの）
export interface ReminderLetterRow {
  billedOn: string; // 2026/06/01
  invoiceNo: string;
  amount: number;
  paid: number; // 0 なら空欄で表示する
  remaining: number;
  dueOn: string; // 2026/06/30
  kind: "未入金" | "一部入金" | "請求中";
}

// 督促状1通分の中身
export interface ReminderLetter {
  addressee: string; // 「井上洋介　様」
  issuedOn: string; // 2026/08/06
  sender: string[]; // 差出人（登録支援機関名・担当）
  title: string;
  paragraphs: string[]; // 本文（1要素＝1段落）
  rows: ReminderLetterRow[];
  total: number; // 参考合計
}

const SENDER = ["登録支援機関 VUONG VAN THANH", "担当：野口　明菜"];

// 残額（請求金額 − 入金済み額。マイナスにはしない）
export function remainingAmount(row: ReminderInvoiceRow): number {
  return Math.max(row.amount - row.paid, 0);
}

// 参考合計 = 未入金の残額 ＋ 今回のご請求額（合算の金額）
export function reminderTotal(input: Pick<ReminderLetterInput, "unpaid" | "current">): number {
  const unpaid = input.unpaid.reduce((sum, r) => sum + remainingAmount(r), 0);
  return unpaid + (input.current ? remainingAmount(input.current) : 0);
}

// 会社・法人などは「御中」、個人事業主は「様」
export function honorificFor(orgName: string): string {
  return /会社|法人|組合|協会/.test(orgName) ? "御中" : "様";
}

// "2026-06-01" → "6月1日"
function mdJp(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : dateStr;
}

// "2026-06-01" → "2026/06/01"（一覧の日付表記）
function slashDate(dateStr: string): string {
  return dateStr.replaceAll("-", "/");
}

function toRow(r: ReminderInvoiceRow, kind: ReminderLetterRow["kind"]): ReminderLetterRow {
  return {
    billedOn: slashDate(r.billedOn),
    invoiceNo: r.invoiceNo,
    amount: r.amount,
    paid: r.paid,
    remaining: remainingAmount(r),
    dueOn: slashDate(r.dueOn),
    kind,
  };
}

// 督促状1通分の文面と一覧表を組み立てる
export function buildReminderLetter(input: ReminderLetterInput): ReminderLetter {
  // 未入金は古い請求から順に載せる（一番古い請求の日付を本文で使う）
  const sorted = [...input.unpaid].sort((a, b) => a.billedOn.localeCompare(b.billedOn));
  const oldest = sorted[0];
  const hasPartial = sorted.some((r) => r.paid > 0);

  const paragraphs: string[] = ["いつも大変お世話になっております。"];
  if (oldest) {
    paragraphs.push(
      `さて、${mdJp(oldest.billedOn)}付で発行いたしましたご請求書につきまして支払い期限を` +
        `${mdJp(oldest.dueOn)}としておりましたが、本日現在、まだご入金の確認がとれていない状況です。`,
    );
  }
  if (hasPartial) {
    paragraphs.push("一部ご入金をいただいている請求は、入金済み額と残額を記載しております。");
  }
  if (input.current) {
    paragraphs.push(
      `念の為、${mdJp(input.current.billedOn)}付で発行しております請求書分まで一覧に` +
        "まとめて記載しておりますので、ご確認いただけますと幸いです。",
    );
  }
  paragraphs.push(
    "すでに、お支払いがお済みでした場合は、行き違いとなり誠に申し訳ございません。",
    "何卒、ご確認のほど、よろしくお願い申し上げます。",
  );

  const rows = sorted.map((r) => toRow(r, r.paid > 0 ? "一部入金" : "未入金"));
  if (input.current) rows.push(toRow(input.current, "請求中"));

  return {
    addressee: `${input.orgName}　${input.honorific}`,
    issuedOn: slashDate(input.issuedOn),
    sender: SENDER,
    title: "未入金のお支払いについて",
    paragraphs,
    rows,
    total: reminderTotal(input),
  };
}
