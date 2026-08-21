// ワード（.docx）の書き出し。
// 労働局へ提出する様式（様式30 求人者リストなど）を、もらった書式のまま作って
// Wordで開いて印刷・メール送付できるようにする。
//
// .docx は XML を集めた zip なので、テンプレートを使わずに必要な部品だけを組み立てる
// （.xlsx と同じく jszip を使う。実行環境に依存する変換ライブラリは挟まない）。

import JSZip from "jszip";
import { escapeXml } from "@/lib/xlsx-export";

// 用紙（twips。1インチ = 1440twips、1mm ≒ 56.7twips）
export interface DocxPage {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
}

// A4横（297×210mm）。様式30がこの設定
export const A4_LANDSCAPE: DocxPage = {
  width: 16838,
  height: 11906,
  marginTop: 851,
  marginBottom: 851,
  marginLeft: 902,
  marginRight: 851,
};

export interface DocxParagraph {
  kind: "paragraph";
  text: string;
  bold?: boolean;
  size?: number; // ポイント（既定 10.5）
  align?: "left" | "center" | "right";
}

export interface DocxTable {
  kind: "table";
  columnWidths: number[]; // twips。合計を本文の幅に合わせる
  rows: string[][];
  headerRows?: number; // 太字＋中央にする先頭の行数（既定 0）
  rowHeight?: number; // 各行の最低の高さ（twips）
  alignCenterColumns?: number[]; // 中央そろえにする列（0始まり）
}

export type DocxBlock = DocxParagraph | DocxTable;

export interface DocxSpec {
  page?: DocxPage;
  blocks: DocxBlock[];
  fontEast?: string; // 日本語のフォント（既定 ＭＳ 明朝）
  fontAscii?: string; // 英数字のフォント（既定 Century）
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

// Wordのフォント指定。半角と日本語で別のフォントを当てる
function runProps(spec: DocxSpec, bold: boolean, sizePt: number): string {
  const ascii = escapeXml(spec.fontAscii ?? "Century");
  const east = escapeXml(spec.fontEast ?? "ＭＳ 明朝");
  const half = Math.round(sizePt * 2); // w:sz はハーフポイント
  return (
    `<w:rPr><w:rFonts w:ascii="${ascii}" w:hAnsi="${ascii}" w:eastAsia="${east}"/>` +
    (bold ? "<w:b/>" : "") +
    `<w:sz w:val="${half}"/><w:szCs w:val="${half}"/></w:rPr>`
  );
}

// 段落。改行（\n）は同じ段落の中で折り返す
function paragraphXml(
  spec: DocxSpec,
  text: string,
  opts: { bold?: boolean; size?: number; align?: string } = {},
): string {
  const size = opts.size ?? 10.5;
  const rpr = runProps(spec, !!opts.bold, size);
  const align = opts.align && opts.align !== "left" ? `<w:jc w:val="${opts.align}"/>` : "";
  const parts = String(text).split("\n");
  const runs = parts
    .map(
      (line, i) =>
        `<w:r>${rpr}${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join("");
  return `<w:p><w:pPr>${align}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rpr}</w:pPr>${runs}</w:p>`;
}

function tableXml(spec: DocxSpec, table: DocxTable): string {
  const headerRows = table.headerRows ?? 0;
  const center = new Set(table.alignCenterColumns ?? []);
  const grid = table.columnWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const borders =
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
      .join("") +
    "</w:tblBorders>";
  const total = table.columnWidths.reduce((a, b) => a + b, 0);

  const rows = table.rows
    .map((row, r) => {
      const isHeader = r < headerRows;
      const height = table.rowHeight
        ? `<w:trHeight w:val="${table.rowHeight}" w:hRule="atLeast"/>`
        : "";
      const cells = table.columnWidths
        .map((w, c) => {
          const value = row[c] ?? "";
          const align = isHeader || center.has(c) ? "center" : "left";
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>` +
            `<w:vAlign w:val="center"/></w:tcPr>` +
            paragraphXml(spec, value, { bold: isHeader, align }) +
            "</w:tc>"
          );
        })
        .join("");
      const header = isHeader ? "<w:tblHeader/>" : "";
      return `<w:tr><w:trPr>${header}${height}</w:trPr>${cells}</w:tr>`;
    })
    .join("");

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>${borders}</w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`
  );
}

function documentXml(spec: DocxSpec): string {
  const page = spec.page ?? A4_LANDSCAPE;
  const body = spec.blocks
    .map((b) =>
      b.kind === "table"
        ? tableXml(spec, b)
        : paragraphXml(spec, b.text, { bold: b.bold, size: b.size, align: b.align }),
    )
    .join("");
  // 表で終わると Word が続きの段落を求めるため、最後に空の段落を置く
  const tail = paragraphXml(spec, "");
  const sect =
    `<w:sectPr><w:pgSz w:w="${page.width}" w:h="${page.height}" w:orient="landscape"/>` +
    `<w:pgMar w:top="${page.marginTop}" w:right="${page.marginRight}" ` +
    `w:bottom="${page.marginBottom}" w:left="${page.marginLeft}" ` +
    `w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W_NS}"><w:body>${body}${tail}${sect}</w:body></w:document>`
  );
}

// .docx（zip）を組み立てる
export async function buildDocx(spec: DocxSpec): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Types xmlns="${CT_NS}">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>",
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="word/document.xml"/>` +
      "</Relationships>",
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
  );
  zip.file("word/document.xml", documentXml(spec));
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

// テストから中身を確かめられるよう、document.xml だけを取り出せるようにする
export function docxDocumentXml(spec: DocxSpec): string {
  return documentXml(spec);
}
