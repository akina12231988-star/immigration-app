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

// 1ページに収める。支援担当者（と2人以上の支援責任者）は2列に並べ、
// それでも入らなければ行の間隔と文字の大きさを少しずつ小さくする
export function addSupportSystemPages(doc: PDFDocument, font: PDFFont, input: SupportSystemPdfInput): void {
  const black = rgb(0, 0, 0);
  const width = PAGE_W - MARGIN_X * 2;
  const available = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;

  // k は縮める割合（1 = 印刷ページと同じ大きさ）。draw が false のときは高さだけを数える
  const layout = (k: number, page: PDFPage | null): number => {
    const line = LINE * k;
    const after = AFTER * k;
    let y = PAGE_H - MARGIN_TOP;
    const start = y;
    const at = (text: string, size: number, x: number) => {
      page?.drawText(text, { x, y: y - (line + size) / 2 + size * 0.12, size, font, color: black });
    };
    const write = (text: string, size: number, align: "left" | "center" = "left", indentEm = 0) => {
      const w = font.widthOfTextAtSize(text, size);
      at(text, size, align === "center" ? (PAGE_W - w) / 2 : MARGIN_X + indentEm * size);
      y -= line;
    };
    const para = (lines: string[], size: number, align: "left" | "center" = "left", indentEm = 0) => {
      for (const l of lines) write(l, size, align, indentEm);
      y -= after;
    };
    // 名前を2列で（左の列から上から順に）。1人だけなら真ん中に1列
    const names = (list: string[], size: number) => {
      if (list.length <= 1) {
        for (const n of list) para([n], size, "center");
        return;
      }
      const rows = Math.ceil(list.length / 2);
      const colW = width / 2;
      for (let r = 0; r < rows; r++) {
        [list[r], list[r + rows]].forEach((n, c) => {
          if (!n) return;
          let sz = size;
          while (sz > 7 && font.widthOfTextAtSize(n, sz) > colW - 8) sz -= 0.5;
          const w = font.widthOfTextAtSize(n, sz);
          at(n, sz, MARGIN_X + colW * c + (colW - w) / 2);
        });
        y -= line + after;
      }
    };
    const sz = (n: number) => Math.max(7, n * k);

    para(["支援業務を行う体制についての説明"], sz(20), "left", 2);
    para(wrapText(input.note, font, sz(14), width - sz(14)), sz(14), "left", 1);
    y -= (line + after) * 2; // 空行2つ
    para(wrapText(`登録支援機関　${input.officeName}`, font, sz(20), width - sz(20)), sz(20), "left", 1);
    if (input.orgName) para(wrapText(`特定技能所属機関　${input.orgName}`, font, sz(20), width - sz(20)), sz(20), "left", 1);
    if (input.managers.length > 0) {
      para(["＜支援責任者＞"], sz(16), "center");
      names(input.managers, sz(16));
    }
    para(["＜支援担当者一覧＞"], sz(16), "center");
    if (input.staff.length === 0) para(["（未選択）"], sz(16), "center");
    names(input.staff, sz(16));
    return start - y;
  };

  let k = 1;
  while (k > 0.45 && layout(k, null) > available) k -= 0.05;
  layout(k, doc.addPage([PAGE_W, PAGE_H]));
}
