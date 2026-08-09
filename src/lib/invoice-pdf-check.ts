// 請求書PDF（freee）と在籍名簿の照合。
//
// 所属機関へ送る請求書には1人1行で支援代・サポート代が並ぶが、名簿と突き合わせて
// 「請求書に載っていない人」「名簿にいない人」を目で探すのは大変で、
// 行ごとに名簿のNo.を手書きするのも間違いやすい（同じNo.を2人に書くなど）。
// ここで請求書PDFの文字を読み取り、名簿と照合してNo.を自動で振る。
//
// PDFの文字の取り出し（pdfjs）と書き込み（pdf-lib）は画面側で行い、
// このファイルは「取り出した文字列をどう照合するか」だけを持つ（テストできる形）。

import type { MonthlyBillingRow } from "@/lib/monthly-billing";

// PDFから取り出した1行分の文字（画面側で組み立てる）。
// x・y はPDF内の位置（ポイント。原点は左下）で、No.を書き込む場所に使う
export interface PdfTextLine {
  page: number; // 0はじまり
  x: number; // 行の左端
  y: number; // 行のベースライン
  text: string; // 行の文字を左から順につないだもの
}

// 請求書の中の支援代・サポート代の1行
export interface InvoiceSupportLine {
  page: number;
  x: number;
  y: number;
  name: string; // 摘要の氏名（「さん」の前）
  text: string; // 摘要の全文
  amount: number | null; // 明細金額（行の一番右の数字。読めなければ null）
}

// 照合の結果
export interface InvoiceCheckResult {
  matched: {
    no: number; // 名簿のNo.（氏名順・1はじまり）
    name: string;
    line: InvoiceSupportLine;
    amountMismatch: boolean; // 名簿の支援費請求額と明細金額が違う
    rosterAmount: number;
  }[];
  // 名簿にいるのに請求書に支援代・サポート代の行が無い人（請求漏れの疑い）
  missing: { no: number; name: string; amount: number }[];
  // 請求書にあるのに名簿にいない人（対象月・所属機関違いの疑い)
  unknown: InvoiceSupportLine[];
}

// 氏名の照合用の形にそろえる（大文字・空白なし）。
// freee側で「VO  QUANG BEN」のように空白が2つ入っていたり、
// PDFの文字が単語の途中で切れて空白の位置がずれていても合うようにする
export function normalizeName(name: string): string {
  return name.replace(/[\s　]+/g, "").toUpperCase();
}

// 支援代・サポート代の行か。摘要は「◯◯さん　特定技能　7月分の支援代」のような形
const SUPPORT_LINE_RE = /^(.+?)さん.*(支援代|サポート代)/;

// 「15,000」「1,932」のような金額
const AMOUNT_RE = /\d{1,3}(?:,\d{3})*(?![\d,])/g;

// PDFの1行から支援代・サポート代の行を取り出す。該当しない行は null。
// すでにNo.を書き込んだPDFをもう一度アップロードしても照合できるよう、
// 行頭の「No.12」は氏名に入れない
export function parseSupportLine(line: PdfTextLine): InvoiceSupportLine | null {
  const text = line.text.replace(/^No\.\d+\s*/, "");
  const m = SUPPORT_LINE_RE.exec(text);
  if (!m) return null;
  // 行の一番右の数字を明細金額として読む（数量「1人」の1は桁が小さいので単価・金額が残る）
  const nums = text.match(AMOUNT_RE) ?? [];
  const last = nums.length > 0 ? Number(nums[nums.length - 1].replace(/,/g, "")) : null;
  return {
    page: line.page,
    x: line.x,
    y: line.y,
    name: m[1].trim(),
    text,
    amount: last !== null && Number.isFinite(last) ? last : null,
  };
}

// 名簿（org.rows。エクセルの在籍名簿と同じ氏名順）と請求書の行を照合する。
// No.はエクセルのNo.列と同じ「氏名順の並びで1はじまり」
export function checkInvoiceLines(
  rosterRows: MonthlyBillingRow[],
  lines: PdfTextLine[],
): InvoiceCheckResult {
  const supportLines = lines
    .map(parseSupportLine)
    .filter((l): l is InvoiceSupportLine => l !== null);

  const byName = new Map<string, { no: number; row: MonthlyBillingRow }>();
  rosterRows.forEach((row, i) => {
    byName.set(normalizeName(row.worker.name), { no: i + 1, row });
  });

  const matched: InvoiceCheckResult["matched"] = [];
  const unknown: InvoiceSupportLine[] = [];
  const found = new Set<number>(); // 請求書に出てきた名簿のNo.

  for (const line of supportLines) {
    const hit = byName.get(normalizeName(line.name));
    if (!hit) {
      unknown.push(line);
      continue;
    }
    found.add(hit.no);
    matched.push({
      no: hit.no,
      name: hit.row.worker.name,
      line,
      // 日割りなどで1人に複数行あることもあるため、金額はその行と名簿の請求額で比べる
      amountMismatch: line.amount !== null && line.amount !== hit.row.amount,
      rosterAmount: hit.row.amount,
    });
  }

  // 請求額が0円の人（支援代（月額）未登録など）は請求書に載らなくても漏れとしない
  const missing = rosterRows
    .map((row, i) => ({ no: i + 1, name: row.worker.name, amount: row.amount }))
    .filter((r) => !found.has(r.no) && r.amount > 0);

  return { matched, missing, unknown };
}
