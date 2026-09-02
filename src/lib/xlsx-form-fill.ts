// 公式様式（public/forms/ の Excel テンプレート）へ値を転記する共通部分。
//
// jszip でテンプレートのXMLを直接編集する（対象セル以外はテンプレートを
// バイト単位でそのまま残す）。以前は exceljs で読み込み直して書き出していたが、
// デプロイ環境によっては壊れたファイルが生成され、Excel が開くときに「修復」して
// シートが空になる問題が起きたため、テンプレートを解釈し直さないこの方式にしている。
//
// 退職の届出書（resignation-forms）と契約内容変更の届出書（contract-change-forms）で
// 同じ書き方をするため、ここに置いている。

export const CHECKED = "☑";
export const UNCHECKED = "□";

// 書き込むセルの値一式（セル番地 → 文字列）
export type CellValues = Record<string, string>;

export interface DateParts {
  y: string;
  m: string;
  d: string;
}

// YYYY-MM-DD を年・月・日に分ける（月日の先頭0は落とす。空・不正な値は空欄）
export function dateParts(dateStr: string | null | undefined): DateParts {
  if (!dateStr) return { y: "", m: "", d: "" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return { y: "", m: "", d: "" };
  return { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) };
}

// 在留カード番号を1文字ずつ12個のマスへ（スペース除去・大文字化）
export function cardChars(cardNo: string): string[] {
  const chars = cardNo.replace(/\s/g, "").toUpperCase().split("");
  return Array.from({ length: 12 }, (_, i) => chars[i] ?? "");
}

// 法人番号を1桁ずつ13個のマスへ（数字以外は除去。空なら全マス空欄のまま）
export function corporateChars(corporateNo: string): string[] {
  const digits = corporateNo.replace(/\D/g, "").split("");
  return Array.from({ length: 13 }, (_, i) => digits[i] ?? "");
}

// チェックボックス群: 該当セルだけ ☑、それ以外は □ にする
export function checkMarks(cells: string[], checkedCell: string | null): CellValues {
  return Object.fromEntries(cells.map((c) => [c, c === checkedCell ? CHECKED : UNCHECKED]));
}

// XMLに入れる文字のエスケープ（Wordの様式でも使う）
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// sheet1.xml 内の <c r="番地" ...> 要素だけを書き換える。
// スタイル属性（s="n"）は残し、値は inlineStr（テンプレートと同じ文字列形式）で入れる。
function setSheetCell(xml: string, addr: string, value: string): string {
  const key = `<c r="${addr}"`;
  const start = xml.indexOf(key);
  if (start < 0) {
    throw new Error(`テンプレートにセル ${addr} が見つかりません（様式が変わった可能性があります）`);
  }
  const tagEnd = xml.indexOf(">", start);
  const selfClosing = xml[tagEnd - 1] === "/";
  const end = selfClosing ? tagEnd + 1 : xml.indexOf("</c>", tagEnd) + "</c>".length;
  const openTag = xml.slice(start, tagEnd);
  const sAttr = / s="\d+"/.exec(openTag)?.[0] ?? "";
  const cell =
    value === ""
      ? `<c r="${addr}"${sAttr}/>`
      : `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  return xml.slice(0, start) + cell + xml.slice(end);
}

// Excel テンプレートの先頭シートへセル値を転記する（対象セル以外は一切変更しない）
export async function fillXlsxTemplate(
  template: ArrayBuffer,
  cells: CellValues,
): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheet = zip.file(sheetPath);
  if (!sheet) throw new Error("テンプレートの形式が不正です（sheet1.xml がありません）");
  let xml = await sheet.async("string");
  for (const [addr, value] of Object.entries(cells)) {
    xml = setSheetCell(xml, addr, value);
  }
  // createFolders: false — テンプレートに無いフォルダエントリを zip に増やさない
  zip.file(sheetPath, xml, { createFolders: false });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// 住所を様式の「〒」欄に入れる形にする（既に〒が付いていればそのまま）
export function withPostalMark(address: string): string {
  const a = address.trim();
  return a.startsWith("〒") ? a : `〒　${a}`;
}
