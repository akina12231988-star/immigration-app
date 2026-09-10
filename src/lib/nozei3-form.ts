import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { isMyNumberFillable, taxOfficeShortName } from "@/lib/tax-office";

// ---- 納税証明書交付請求書（国税庁の様式・納税証明書その3）への自動入力 ----
// テンプレート（public/forms/nozei-shomei-3.pdf）には代理人記入欄・その3のチェック・枚数・
// 使用目的が印字済み。ここでは右上の枠（住所（納税地）・フリガナ・氏名・個人番号）と
// 「◯◯税務署長 あて」の税務署名を書き込む。
// 座標は様式を解析して特定した（A4縦 595.22×842pt。pdf-lib は左下が原点）。

export interface Nozei3FormData {
  name: string; // 氏名
  kana: string; // フリガナ
  address: string; // 住所（納税地）＝ 現在の住所
  myNumber: string; // 個人番号（12桁。無ければ空欄のまま）
  taxOfficeName: string; // 投函先の税務署名（例: 熊本東税務署）。空なら書かない
}

export interface DrawItem {
  text: string;
  x: number; // 左端（pt）
  y: number; // ベースライン（pt・左下原点）
  size: number;
}

// 様式の枠（上端からの位置）。住所枠 93〜118.6、フリガナ枠 120〜136、氏名枠 136〜177、個人番号枠 178〜200
const PAGE_H = 842;
const BOX_LEFT = 298; // 枠の左端（罫線 294 の少し右）
const BOX_RIGHT = 528; // 枠の右端（罫線 531 の少し左）
const BOX_WIDTH = BOX_RIGHT - BOX_LEFT;

// 個人番号の12マスの左右の境界（左端のマスは空欄にする決まり）
const MY_NUMBER_CELLS = [312.8, 330.8, 348.8, 366.7, 384.7, 402.7, 420.7, 438.7, 456.6, 476.1, 495.6, 513.6, 531.0];

// 上端からの距離を pdf-lib の y に直す
const fromTop = (t: number) => PAGE_H - t;

// 文字幅の計測（フォントに依存するので呼び出し側から渡す。テストでは固定幅）
export type MeasureText = (text: string, size: number) => number;

// 枠の幅に収まるまで文字を小さくする（最小 minSize）
function fitSize(text: string, maxWidth: number, measure: MeasureText, start: number, minSize: number): number {
  let size = start;
  while (size > minSize && measure(text, size) > maxWidth) size -= 0.5;
  return size;
}

// 収まらないときは2行に分ける（文字数の半分あたりで、数字の途中は避けて切る）
function splitTwoLines(text: string): [string, string] {
  const mid = Math.ceil(text.length / 2);
  let cut = mid;
  for (let i = mid; i < text.length && i < mid + 6; i += 1) {
    if (!/[0-9０-９\-－ー]/.test(text[i])) {
      cut = i;
      break;
    }
  }
  return [text.slice(0, cut), text.slice(cut)];
}

// 書き込む文字と位置を組み立てる（純粋関数・テスト対象）
export function buildNozei3DrawItems(data: Nozei3FormData, measure: MeasureText): DrawItem[] {
  const items: DrawItem[] = [];

  // 「◯◯税務署長 あて」の税務署名。「税務署長」の文字（x=126）の左に右寄せで置く
  const office = taxOfficeShortName(data.taxOfficeName);
  if (office) {
    const size = 9;
    items.push({ text: office, x: 124 - measure(office, size), y: fromTop(80.5), size });
  }

  // 住所（納税地）: 1行で収まるよう縮小し、それでも収まらなければ2行
  const address = (data.address ?? "").trim();
  if (address) {
    const size = fitSize(address, BOX_WIDTH, measure, 8, 6.5);
    if (measure(address, size) <= BOX_WIDTH) {
      items.push({ text: address, x: BOX_LEFT, y: fromTop(109), size });
    } else {
      const [l1, l2] = splitTwoLines(address);
      const size2 = Math.min(fitSize(l1, BOX_WIDTH, measure, 7, 5.5), fitSize(l2, BOX_WIDTH, measure, 7, 5.5));
      items.push({ text: l1, x: BOX_LEFT, y: fromTop(104), size: size2 });
      items.push({ text: l2, x: BOX_LEFT, y: fromTop(115), size: size2 });
    }
  }

  // フリガナ
  const kana = (data.kana ?? "").trim();
  if (kana) {
    const size = fitSize(kana, BOX_WIDTH, measure, 7, 5);
    items.push({ text: kana, x: BOX_LEFT, y: fromTop(131.5), size });
  }

  // 氏名
  const name = (data.name ?? "").trim();
  if (name) {
    const size = fitSize(name, BOX_WIDTH, measure, 11, 7);
    items.push({ text: name, x: BOX_LEFT, y: fromTop(160), size });
  }

  // 個人番号: 12桁のときだけ、右の12マスに1桁ずつ（左端のマスは空欄）
  const digits = (data.myNumber ?? "").replace(/[^0-9]/g, "");
  if (isMyNumberFillable(digits)) {
    const size = 9;
    for (let i = 0; i < 12; i += 1) {
      const left = MY_NUMBER_CELLS[i];
      const right = MY_NUMBER_CELLS[i + 1];
      const w = measure(digits[i], size);
      items.push({ text: digits[i], x: (left + right) / 2 - w / 2, y: fromTop(198), size });
    }
  }

  return items;
}

// テンプレートPDFに書き込んで返す
export async function fillNozei3Form(
  template: ArrayBuffer | Uint8Array,
  font: ArrayBuffer | Uint8Array,
  data: Nozei3FormData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  // 扶養控除等申告書と同じく TrueType（glyf）版を全埋め込みにする（subset は一部ビューアで出ないため使わない）
  const jpFont = await doc.embedFont(font, { subset: false });
  const page = doc.getPages()[0];
  const items = buildNozei3DrawItems(data, (text, size) => jpFont.widthOfTextAtSize(text, size));
  for (const it of items) {
    page.drawText(it.text, { x: it.x, y: it.y, size: it.size, font: jpFont, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
