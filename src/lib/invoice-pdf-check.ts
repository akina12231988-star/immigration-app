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
  // メモ（請求しない理由）が入力されていて請求書にも無い人。漏れではなく意図した除外
  skipped: { no: number; name: string; amount: number; note: string }[];
  // メモでは請求しないはずなのに、請求書に載っている人（メモか請求書のどちらかが違う）
  notedButBilled: { no: number; name: string; note: string }[];
}

// 氏名の照合用の形にそろえる（大文字・空白なし）。
// freee側で「VO  QUANG BEN」のように空白が2つ入っていたり、
// PDFの文字が単語の途中で切れて空白の位置がずれていても合うようにする
export function normalizeName(name: string): string {
  return name.replace(/[\s　]+/g, "").toUpperCase();
}

// 支援代・サポート代の行か。摘要は「◯◯さん　特定技能　7月分の支援代」のような形。
// 一度No.を書き込んだPDFでは文字の切れ方が変わり「1 人」「サポート 代」のように
// 空白が挟まることがあるため、語の間の空白は許して判定する
const SUPPORT_KIND_RE = /支\s*援\s*代|サ\s*ポ\s*ー\s*ト\s*代/;

// 摘要の氏名のうしろに付く「さん」
const HONORIFIC_RE = /さ\s*ん/;

// 摘要から氏名を取り出す。基本は「◯◯さん　特定技能　7月分の支援代」だが、
// 「さん」を付け忘れた行（「◯◯　特定技能　7月分の支援代」）もあるので、
// その場合は全角スペースの手前までを氏名として読む。
// どちらも無ければ空文字（照合は checkInvoiceLines 側で行頭一致に任せる）
export function supportLineName(text: string): string {
  const kind = SUPPORT_KIND_RE.exec(text);
  const kindAt = kind ? kind.index : text.length;

  // 「さん」が支援代・サポート代より前にあれば、その手前までが氏名
  const honorific = HONORIFIC_RE.exec(text);
  if (honorific && honorific.index > 0 && honorific.index < kindAt) {
    return text.slice(0, honorific.index).trim();
  }

  // 「さん」が無い行。氏名の中の空白は半角なので、全角スペースを区切りとみなす
  const sep = text.indexOf("　");
  if (sep > 0 && sep < kindAt) return text.slice(0, sep).trim();
  return "";
}

// 明細の数量「1人」。備考欄にも「支援代なし」のような文が書かれることがあるため、
// 数量がある行だけを明細として扱う（備考の行にNo.を振らないように）
const QTY_RE = /\s(\d+)\s*人(?=\s|$)/g;

// 「15,000」「1,932」のような金額
const AMOUNT_RE = /\d{1,3}(?:,\d{3})*(?![\d,])/g;

// PDFの1行から支援代・サポート代の明細行を取り出す。該当しない行は null。
// すでにNo.を書き込んだPDFをもう一度アップロードしても照合できるよう、
// 行頭の「No.12」は氏名に入れない
export function parseSupportLine(line: PdfTextLine): InvoiceSupportLine | null {
  const text = line.text.replace(/^No\.\d+\s*/, "");
  if (!SUPPORT_KIND_RE.test(text)) return null;

  // 数量「1人」より右にある一番右の数字を明細金額として読む。
  // 摘要の「7月2日までの」のような日付の数字を金額と読み間違えないため
  let qtyEnd = -1;
  for (let q = QTY_RE.exec(text); q; q = QTY_RE.exec(text)) qtyEnd = q.index + q[0].length;
  if (qtyEnd < 0) return null; // 数量が無い行は明細ではない（備考欄の文章など）
  const nums = text.slice(qtyEnd).match(AMOUNT_RE) ?? [];
  const last = nums.length > 0 ? Number(nums[nums.length - 1].replace(/,/g, "")) : null;
  return {
    page: line.page,
    x: line.x,
    y: line.y,
    name: supportLineName(text),
    text,
    amount: last !== null && Number.isFinite(last) ? last : null,
  };
}

// 名簿と請求書の行を照合する。
// 渡す名簿は必ず在籍名簿（エクセル）と同じ並び（rosterOrderRows＝雇用開始日の古い順）にする。
// No.はその並びで1はじまり＝エクセルのNo.列と同じ番号になる。
// notes は名簿のメモ（請求しない理由。worker.id → メモ）。メモが入力されている人は
// 請求書に載っていなくても漏れではなく「意図して請求しない人」として扱う
export function checkInvoiceLines(
  rosterRows: MonthlyBillingRow[],
  lines: PdfTextLine[],
  notes: Record<string, string> = {},
): InvoiceCheckResult {
  const supportLines = lines
    .map(parseSupportLine)
    .filter((l): l is InvoiceSupportLine => l !== null);

  const byName = new Map<string, { no: number; row: MonthlyBillingRow }>();
  rosterRows.forEach((row, i) => {
    byName.set(normalizeName(row.worker.name), { no: i + 1, row });
  });
  const noteOf = (row: MonthlyBillingRow): string => (notes[row.worker.id] ?? "").trim();

  // 摘要から氏名を切り出せなかった行（「さん」も全角スペースも無い書き方）でも
  // 拾えるように、行の書き出しが名簿の氏名と一致するかで引き当てる。
  // 同じ書き出しの人が複数いるときは、より長く一致する方を採る
  const matchByHead = (line: InvoiceSupportLine) => {
    const flat = normalizeName(line.text);
    let best: { no: number; row: MonthlyBillingRow } | undefined;
    let bestLen = 0;
    for (const [key, hit] of byName) {
      if (key.length > bestLen && flat.startsWith(key)) {
        best = hit;
        bestLen = key.length;
      }
    }
    return best;
  };

  const matched: InvoiceCheckResult["matched"] = [];
  const unknown: InvoiceSupportLine[] = [];
  const notedButBilled: InvoiceCheckResult["notedButBilled"] = [];
  const found = new Set<number>(); // 請求書に出てきた名簿のNo.

  for (const line of supportLines) {
    const hit = byName.get(normalizeName(line.name)) ?? matchByHead(line);
    if (!hit) {
      unknown.push(line);
      continue;
    }
    if (!found.has(hit.no) && noteOf(hit.row)) {
      notedButBilled.push({ no: hit.no, name: hit.row.worker.name, note: noteOf(hit.row) });
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

  // 請求書に載っていない人のうち、メモがある人は「意図して請求しない人」、
  // メモも無い人は「請求漏れの疑い」。請求額0円の人（支援代（月額）未登録など）は出さない
  const missing: InvoiceCheckResult["missing"] = [];
  const skipped: InvoiceCheckResult["skipped"] = [];
  rosterRows.forEach((row, i) => {
    const no = i + 1;
    if (found.has(no) || row.amount <= 0) return;
    const note = noteOf(row);
    if (note) skipped.push({ no, name: row.worker.name, amount: row.amount, note });
    else missing.push({ no, name: row.worker.name, amount: row.amount });
  });

  return { matched, missing, unknown, skipped, notedButBilled };
}
