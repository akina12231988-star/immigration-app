// 「支援業務を行う体制についての説明」（支援責任者・支援担当者の名簿）を PDF のページとして作る。
// 印刷ページ（app/(app)/support-org/print/SupportSystemPrintSheet.tsx）と同じ内容・同じ文字の大きさで、
// 参考様式第1-17号（支援計画書）の PDF のうしろに付ける。
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";

export interface SupportSystemPdfInput {
  note: string; // 説明文（登録支援機関の情報の「支援業務を行う体制についての説明」）
  officeName: string; // 登録支援機関の名称
  orgName: string; // 特定技能所属機関の名称（空なら行を出さない）
  managers: string[]; // 支援責任者
  staff: string[]; // 支援担当者（1人目が先頭）
}

// A4 縦（pt）
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 70;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 60;
const LINE = 36; // 印刷ページと同じ行の間隔
const AFTER = 8; // 段落のあとの空き

// 幅に収まるよう1文字ずつ折り返す（日本語の文章のため単語では区切らない）
export function wrapText(text: string, font: Pick<PDFFont, "widthOfTextAtSize">, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const ch of para) {
      if (line && font.widthOfTextAtSize(line + ch, size) > width) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function addSupportSystemPages(doc: PDFDocument, font: PDFFont, input: SupportSystemPdfInput): void {
  const black = rgb(0, 0, 0);
  const width = PAGE_W - MARGIN_X * 2;
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_TOP; // いまの行の上端

  const nextLine = (h: number) => {
    if (y - h < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
    }
  };
  // 1行を書く。align は left（indent 文字ぶん下げる）か center
  const write = (text: string, size: number, align: "left" | "center" = "left", indentEm = 0) => {
    nextLine(LINE);
    const w = font.widthOfTextAtSize(text, size);
    const x = align === "center" ? (PAGE_W - w) / 2 : MARGIN_X + indentEm * size;
    // 行の高さの中で文字を真ん中あたりに置く
    page.drawText(text, { x, y: y - (LINE + size) / 2 + size * 0.12, size, font, color: black });
    y -= LINE;
  };
  const para = (lines: string[], size: number, align: "left" | "center" = "left", indentEm = 0) => {
    for (const l of lines) write(l, size, align, indentEm);
    y -= AFTER;
  };

  para(["支援業務を行う体制についての説明"], 20, "left", 2);
  para(wrapText(input.note, font, 14, width - 14), 14, "left", 1);
  y -= (LINE + AFTER) * 2; // 空行2つ
  para(wrapText(`登録支援機関　${input.officeName}`, font, 20, width - 20), 20, "left", 1);
  if (input.orgName) para(wrapText(`特定技能所属機関　${input.orgName}`, font, 20, width - 20), 20, "left", 1);
  if (input.managers.length > 0) {
    para(["＜支援責任者＞"], 16, "center");
    for (const n of input.managers) para([n], 16, "center");
  }
  para(["＜支援担当者一覧＞"], 16, "center");
  if (input.staff.length === 0) para(["（未選択）"], 16, "center");
  for (const n of input.staff) para([n], 16, "center");
}
