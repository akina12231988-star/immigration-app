import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// ---- 求人不受理に係る自己申告書（様式例第7号）----
//
// 労働局の訪問指導で、求人1件ごとに提出を求められる書類（訪問通知文の別紙⑦）。
// 白紙の様式（public/forms/jiko-shinkoku.pdf）に、右上の年月日と
// 事業所名・事業所所在地・代表者名だけを入れる。
//
// チェックシートは「1つでも該当したら求人不受理」になるため、
// 受理される求人の申告書はチェックが全て空欄。ここでは何も書き込まない。

export interface JikoShinkokuData {
  orgName: string; // 事業所名
  orgAddress: string; // 事業所所在地
  repName: string; // 代表者名
  dateOn: string; // 右上の年月日（YYYY-MM-DD。求人票の記入日を入れる）
}

// 様式の文字位置（1ページ目・A4縦 595.2 x 841.92pt）。
// 白紙の様式から拾った実際の座標に合わせている
const DATE_Y = 790.06;
const DATE_SIZE = 11;
// 「年」「月」「日」の文字が置かれている位置。数字はその手前に右詰めで入れる
const YEAR_END = 430;
const MONTH_END = 471;
const DAY_END = 515;

const FIELD_X = 150; // 「事業所名」などの見出しの右側
const FIELD_SIZE = 11;
const FIELD_MAX_WIDTH = 595.2 - FIELD_X - 45; // 右の余白まで
const FIELDS = [
  { key: "orgName", y: 720.19 },
  { key: "orgAddress", y: 704.83 },
  { key: "repName", y: 689.47 },
] as const;

const INK = rgb(0.1, 0.12, 0.15);

// 年月日を「年・月・日」に分ける（日付として読めないときは空欄のまま）
export function jikoShinkokuDateParts(dateOn: string): {
  year: string;
  month: string;
  day: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateOn ?? "").trim());
  if (!m) return { year: "", month: "", day: "" };
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) };
}

// 枠に収まるまで文字を小さくする（長い住所でもはみ出さない）
export function fitFontSize(
  width: (size: number) => number,
  maxWidth: number,
  base: number,
  min = 7.5,
): number {
  let size = base;
  while (size > min && width(size) > maxWidth) size -= 0.5;
  return size;
}

function drawRight(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  text: string,
  endX: number,
  y: number,
  size: number,
) {
  if (!text) return;
  page.drawText(text, { x: endX - font.widthOfTextAtSize(text, size), y, size, font, color: INK });
}

export async function buildJikoShinkokuPdf(
  formBytes: ArrayBuffer | Uint8Array,
  fontBytes: ArrayBuffer | Uint8Array,
  data: JikoShinkokuData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(formBytes);
  doc.registerFontkit(fontkit);
  const jp = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.getPages()[0];

  const { year, month, day } = jikoShinkokuDateParts(data.dateOn);
  drawRight(page, jp, year, YEAR_END, DATE_Y, DATE_SIZE);
  drawRight(page, jp, month, MONTH_END, DATE_Y, DATE_SIZE);
  drawRight(page, jp, day, DAY_END, DATE_Y, DATE_SIZE);

  for (const f of FIELDS) {
    const text = (data[f.key] ?? "").trim();
    if (!text) continue;
    const size = fitFontSize(
      (s) => jp.widthOfTextAtSize(text, s),
      FIELD_MAX_WIDTH,
      FIELD_SIZE,
    );
    page.drawText(text, { x: FIELD_X, y: f.y, size, font: jp, color: INK });
  }

  return doc.save();
}

// 出すファイル名（会社名と日付が分かるようにする）
export function jikoShinkokuFileName(orgName: string, dateOn: string): string {
  const name = (orgName || "求人").replace(/[\\/:*?"<>|]/g, "");
  return `自己申告書_${name}_${dateOn || ""}.pdf`.replace(/_\.pdf$/, ".pdf");
}
