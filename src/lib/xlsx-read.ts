// エクセル（.xlsx）の読み込み（文字だけ）。
// アプリで書き出した在籍名簿などを読み戻すために、jszip で zip を開いてシートの XML から
// セルの文字を取り出す。書き出し（xlsx-export.ts）の inlineStr と、エクセルで保存し直したときの
// 共有文字列（sharedStrings）の両方に対応する。書式・数式は見ない（数式は計算済みの値を読む）。

import JSZip from "jszip";

export interface ReadSheet {
  name: string;
  rows: string[][]; // 1行目から順に。空セルは ""
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

// <t> の中身をつなぐ（ふりがな <rPh> の中の <t> は除く）
function textOf(xml: string): string {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  const parts = [...noPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]));
  return parts.join("");
}

// A1 → 列番号（0始まり）
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseSheetXml(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNo = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : cells.length;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (v !== undefined) value = unescapeXml(v);
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
    }
    while (rows.length < rowNo - 1) rows.push([]);
    rows[rowNo - 1] = cells;
  }
  return rows;
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<ReadSheet[]> {
  const zip = await JSZip.loadAsync(data);
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const target = new Map(
    [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [
      /\bId="([^"]+)"/.exec(m[1])?.[1] ?? "",
      (/\bTarget="([^"]+)"/.exec(m[1])?.[1] ?? "").replace(/^\/?xl\//, ""),
    ]),
  );
  const sheets: ReadSheet[] = [];
  for (const sm of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(sm[1])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(sm[1])?.[1] ?? "";
    const path = `xl/${target.get(rid) ?? ""}`;
    const xml = await zip.file(path)?.async("string");
    if (xml) sheets.push({ name, rows: parseSheetXml(xml, shared) });
  }
  return sheets;
}
