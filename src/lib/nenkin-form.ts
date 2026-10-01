import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { isMyNumberFillable } from "@/lib/tax-office";

// ---- 【特定技能・本人用】年金加入記録・国民年金保険料納付記録交付申請書（年金事務所あて）への自動入力 ----
// テンプレート（public/forms/nenkin-kiroku.pdf）は日本年金機構の様式をスキャンしたもの。
// 「1. 交付申請者」の ①基礎年金番号・②住所・③氏名・⑤生年月日 を書き込む。
// ④性別は丸を付ける様式なので何も書かない（手書き）。⑥電話番号・申請事由・期間・委任欄・申請日は様式に印字済み。
// 基礎年金番号が分からないときは ① を空欄のまま、「1. 交付申請者」の見出しの上に「個人番号：〇〇」と書く。
// 座標は様式を解析して特定した（A4縦 593×838pt。pdf-lib は左下が原点）。

export interface NenkinFormData {
  name: string; // 氏名（在留カードのローマ字表記）
  address: string; // 住所（現在の住所）
  birth: string; // 生年月日 YYYY-MM-DD（無ければ空欄のまま）
  pensionNo: string; // 基礎年金番号（10桁。無ければ個人番号を上に書く）
  myNumber: string; // 個人番号（12桁。基礎年金番号が無いときだけ使う）
}

export interface DrawItem {
  text: string;
  x: number; // 左端（pt）
  y: number; // ベースライン（pt・左下原点）
  size: number;
}

const PAGE_H = 838;
// 上端からの距離を pdf-lib の y に直す
const fromTop = (t: number) => PAGE_H - t;

// ①基礎年金番号のマスの左右の境界（11マス。5つ目は「－」が印字されているので飛ばす）
export const NENKIN_PENSION_CELLS = [64.5, 85, 105.8, 126.2, 146.7, 167.6, 188.3, 208.8, 229.5, 250, 270.5, 291.2];
const PENSION_DIGIT_CELLS = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10]; // 10桁それぞれが入るマスの番号
// ⑤生年月日のマス（西暦4桁・月2桁・日2桁）
export const NENKIN_YEAR_CELLS = [158, 171.4, 185.4, 199.1, 212.8];
export const NENKIN_MONTH_CELLS = [237.2, 251, 265];
export const NENKIN_DAY_CELLS = [293, 306.5, 320.3];

// ②住所の枠（上端 283〜322。〒の印字の右から枠の右端まで）
const ADDRESS_LEFT = 180;
const ADDRESS_RIGHT = 526;
const ADDRESS_WIDTH = ADDRESS_RIGHT - ADDRESS_LEFT;
// ③氏名の枠（上端 322〜358。④性別の仕切り 401 まで）
const NAME_LEFT = 170;
const NAME_RIGHT = 396;
const NAME_WIDTH = NAME_RIGHT - NAME_LEFT;

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

// 基礎年金番号の数字だけ（10桁ならマスに入れられる）
export function pensionNoDigits(pensionNo: string): string {
  return (pensionNo ?? "").replace(/[^0-9]/g, "");
}

// マスの中央に1文字ずつ置く
function centered(cells: number[], chars: string, cellIdx: number[], baseline: number, size: number, measure: MeasureText): DrawItem[] {
  return chars.split("").map((ch, i) => {
    const left = cells[cellIdx[i]];
    const right = cells[cellIdx[i] + 1];
    return { text: ch, x: (left + right) / 2 - measure(ch, size) / 2, y: fromTop(baseline), size };
  });
}

// 書き込む文字と位置を組み立てる（純粋関数・テスト対象）
export function buildNenkinDrawItems(data: NenkinFormData, measure: MeasureText): DrawItem[] {
  const items: DrawItem[] = [];

  // ①基礎年金番号: 10桁のときはマスに1桁ずつ。それ以外（未登録）は「1. 交付申請者」の上に個人番号を書く
  const pension = pensionNoDigits(data.pensionNo);
  if (pension.length === 10) {
    items.push(...centered(NENKIN_PENSION_CELLS, pension, PENSION_DIGIT_CELLS, 257, 11, measure));
  } else {
    const my = (data.myNumber ?? "").replace(/[^0-9]/g, "");
    const text = `個人番号：${isMyNumberFillable(my) ? my : "（未登録）"}`;
    items.push({ text, x: NENKIN_PENSION_CELLS[0], y: fromTop(198), size: 10 });
  }

  // ②住所: 1行で収まるよう縮小し、それでも収まらなければ2行
  const address = (data.address ?? "").trim();
  if (address) {
    const size = fitSize(address, ADDRESS_WIDTH, measure, 10, 7);
    if (measure(address, size) <= ADDRESS_WIDTH) {
      items.push({ text: address, x: ADDRESS_LEFT, y: fromTop(309), size });
    } else {
      const [l1, l2] = splitTwoLines(address);
      const size2 = Math.min(fitSize(l1, ADDRESS_WIDTH, measure, 8, 6), fitSize(l2, ADDRESS_WIDTH, measure, 8, 6));
      items.push({ text: l1, x: ADDRESS_LEFT, y: fromTop(302), size: size2 });
      items.push({ text: l2, x: ADDRESS_LEFT, y: fromTop(315), size: size2 });
    }
  }

  // ③氏名
  const name = (data.name ?? "").trim();
  if (name) {
    const size = fitSize(name, NAME_WIDTH, measure, 12, 7);
    items.push({ text: name, x: NAME_LEFT, y: fromTop(346), size });
  }

  // ⑤生年月日: YYYY-MM-DD のときだけ、西暦4桁・月2桁・日2桁をマスに
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((data.birth ?? "").trim());
  if (m) {
    items.push(...centered(NENKIN_YEAR_CELLS, m[1], [0, 1, 2, 3], 382, 11, measure));
    items.push(...centered(NENKIN_MONTH_CELLS, m[2], [0, 1], 382, 11, measure));
    items.push(...centered(NENKIN_DAY_CELLS, m[3], [0, 1], 382, 11, measure));
  }

  return items;
}

// テンプレートPDFに書き込んで返す
export async function fillNenkinForm(
  template: ArrayBuffer | Uint8Array,
  font: ArrayBuffer | Uint8Array,
  data: NenkinFormData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  doc.registerFontkit(fontkit);
  // 納税証明書その3と同じく TrueType 版を全埋め込みにする（subset は一部ビューアで出ないため使わない）
  const jpFont = await doc.embedFont(font, { subset: false });
  const page = doc.getPages()[0];
  const items = buildNenkinDrawItems(data, (text, size) => jpFont.widthOfTextAtSize(text, size));
  for (const it of items) {
    page.drawText(it.text, { x: it.x, y: it.y, size: it.size, font: jpFont, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
