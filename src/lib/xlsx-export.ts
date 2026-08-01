// エクセル（.xlsx）の書き出し。
// 月末の在籍名簿を所属機関へメールで送るため、画面の集計をそのままブックにする。
//
// .xlsx は XML を集めた zip なので、テンプレートを使わずに必要な部品だけを組み立てる
// （随時届出の様式と同じく jszip を使う。実行環境に依存する変換ライブラリは挟まない）。
// 文字列はすべて inlineStr で書くため sharedStrings.xml は作らない。

import JSZip from "jszip";

// セルの値。数値はそのまま、文字列は inlineStr で書く
export type CellValue = string | number | null | undefined;

export interface SheetSpec {
  name: string; // シート名（31文字まで。使えない文字は自動で置き換える）
  rows: CellValue[][]; // 1行目から順に。空セルは null
  headerRows?: number; // 太字にする先頭の行数（既定 0）
  columnWidths?: number[]; // 列幅（文字数。省略した列は既定幅）
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// XMLに入れられない制御文字を落としつつエスケープする
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 0 → A, 25 → Z, 26 → AA
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

// シート名に使えない文字（[ ] : * ? / \）を全角に置き換え、31文字までに切る。
// 空になる場合は連番で代用する
export function safeSheetName(name: string, index: number): string {
  const replaced = name
    .replace(/[[\]]/g, "")
    .replace(/:/g, "：")
    .replace(/\*/g, "＊")
    .replace(/\?/g, "？")
    .replace(/[/\\]/g, "／")
    .replace(/^'+|'+$/g, "")
    .trim();
  const cut = [...replaced].slice(0, 31).join("");
  return cut || `シート${index + 1}`;
}

// 同じ名前のシートが並ばないよう末尾に連番を足す
export function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    const base = safeSheetName(name, i);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    for (let n = 2; ; n += 1) {
      const suffix = `(${n})`;
      const candidate = [...base].slice(0, 31 - suffix.length).join("") + suffix;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  });
}

function cellXml(value: CellValue, ref: string, style: number): string {
  if (value === null || value === undefined || value === "") {
    return style ? `<c r="${ref}" s="${style}"/>` : "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // 数値は書式つきスタイル（カンマ区切り）で書く
    return `<c r="${ref}" s="${style || 2}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    String(value),
  )}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const headerRows = sheet.headerRows ?? 0;
  const cols = (sheet.columnWidths ?? [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const rows = sheet.rows
    .map((row, r) => {
      const style = r < headerRows ? 1 : 0;
      const cells = row
        .map((value, c) => cellXml(value, `${columnLetter(c)}${r + 1}`, style))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}">${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// シートの一覧から .xlsx のバイト列を作る
export async function buildXlsx(sheets: SheetSpec[]): Promise<Blob> {
  if (sheets.length === 0) throw new Error("シートがありません");
  const names = uniqueSheetNames(sheets.map((s) => s.name));
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join("\n")}
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  );

  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets>${names
      .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );

  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  .join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>
</Relationships>`,
  );

  zip.file("xl/styles.xml", STYLES_XML);
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)));

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}

// ブラウザでダウンロードさせる
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
