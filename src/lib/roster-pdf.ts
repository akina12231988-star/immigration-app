import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { rosterJpDate, sortRosterHistory } from "@/lib/roster";
import type { RosterHistoryEntry, RosterPreviousJob } from "@/types/db";

// 労働者名簿（労働基準法第107条）のPDFを組み立てる。
// 画面の労働者名簿と同じ項目を、A4縦1枚の表として描く。
// 日本語を出すため TrueType フォント（public/fonts/NotoSansJP-Regular.ttf）を埋め込む。

export interface RosterPdfData {
  workerName: string;
  kana: string;
  birth: string | null; // YYYY-MM-DD
  gender: string;
  address: string;
  myNumber: string;
  companyName: string;
  workKind: string;
  employmentStartOn: string | null; // YYYY-MM-DD
  history: RosterHistoryEntry[];
  previousJobs: RosterPreviousJob[];
  leavingOn: string; // 表示用の文字列（例: 2026年8月20日）
  leavingReason: string;
  issuedOn: string; // YYYY-MM-DD
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const LINE = rgb(0.75, 0.78, 0.82);
const INK = rgb(0.1, 0.12, 0.15);

// 1行分の高さ
const ROW_H = 26;

interface Cursor {
  page: PDFPage;
  y: number;
}

function text(page: PDFPage, font: PDFFont, s: string, x: number, y: number, size: number) {
  page.drawText(s || "", { x, y, size, font, color: INK });
}

// 枠付きの1行（見出し＋内容）
function labeledRow(c: Cursor, font: PDFFont, label: string, value: string, labelW = 130) {
  const w = A4.width - MARGIN * 2;
  c.page.drawRectangle({
    x: MARGIN,
    y: c.y - ROW_H,
    width: w,
    height: ROW_H,
    borderColor: LINE,
    borderWidth: 0.8,
  });
  c.page.drawLine({
    start: { x: MARGIN + labelW, y: c.y },
    end: { x: MARGIN + labelW, y: c.y - ROW_H },
    color: LINE,
    thickness: 0.8,
  });
  text(c.page, font, label, MARGIN + 8, c.y - ROW_H + 8, 10);
  text(c.page, font, value, MARGIN + labelW + 8, c.y - ROW_H + 8, 11);
  c.y -= ROW_H;
}

// 2列の表（年月日＋内容 など）
function twoColTable(
  c: Cursor,
  font: PDFFont,
  title: string,
  head: [string, string],
  rows: [string, string][],
  firstColW = 130,
) {
  c.y -= 14;
  text(c.page, font, title, MARGIN, c.y - 12, 11);
  c.y -= 20;
  const w = A4.width - MARGIN * 2;
  const empty: [string, string] = ["—", "—"];
  const all: [string, string][] = [head, ...(rows.length > 0 ? rows : [empty])];
  all.forEach(([a, b], i) => {
    c.page.drawRectangle({
      x: MARGIN,
      y: c.y - ROW_H,
      width: w,
      height: ROW_H,
      borderColor: LINE,
      borderWidth: 0.8,
    });
    c.page.drawLine({
      start: { x: MARGIN + firstColW, y: c.y },
      end: { x: MARGIN + firstColW, y: c.y - ROW_H },
      color: LINE,
      thickness: 0.8,
    });
    const size = i === 0 ? 10 : 11;
    text(c.page, font, a, MARGIN + 8, c.y - ROW_H + 8, size);
    text(c.page, font, b, MARGIN + firstColW + 8, c.y - ROW_H + 8, size);
    c.y -= ROW_H;
  });
}

export async function buildRosterPdf(
  font: ArrayBuffer | Uint8Array,
  data: RosterPdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const jp = await doc.embedFont(font, { subset: false });
  const page = doc.addPage([A4.width, A4.height]);
  const c: Cursor = { page, y: A4.height - MARGIN };

  // 見出し
  text(page, jp, "労働者名簿", MARGIN, c.y - 20, 20);
  const issued = `発行年月日: ${rosterJpDate(data.issuedOn)}`;
  text(page, jp, issued, A4.width - MARGIN - jp.widthOfTextAtSize(issued, 10), c.y - 16, 10);
  c.y -= 40;

  labeledRow(c, jp, "名前", data.workerName);
  labeledRow(c, jp, "フリガナ", data.kana);
  labeledRow(c, jp, "生年月日", rosterJpDate(data.birth));
  labeledRow(c, jp, "性別", data.gender);
  labeledRow(c, jp, "住所", data.address);
  labeledRow(c, jp, "業務の種類", data.workKind);
  labeledRow(c, jp, "個人番号", data.myNumber);
  labeledRow(c, jp, "雇用開始年月日", rosterJpDate(data.employmentStartOn));

  twoColTable(
    c,
    jp,
    "履歴",
    ["年月日", "内容"],
    sortRosterHistory(data.history).map((h) => [h.on, h.content] as [string, string]),
  );

  twoColTable(
    c,
    jp,
    "前職",
    ["会社名", "都道府県"],
    data.previousJobs.map((p) => [p.company, p.prefecture] as [string, string]),
    260,
  );

  twoColTable(c, jp, "解雇・退職または死亡", ["年月日", "事由"], [
    [data.leavingOn || "—", data.leavingReason || "—"],
  ]);

  // 保存期間の注記（画面の労働者名簿と同じ文にそろえる）
  c.y -= 18;
  text(
    page,
    jp,
    "本名簿は労働基準法第107条に基づき作成し、同法第109条により発行日から5年間保存する。",
    MARGIN,
    c.y,
    9,
  );

  return doc.save();
}
