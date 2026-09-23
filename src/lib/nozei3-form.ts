import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { isMyNumberFillable, taxOfficeShortName } from "@/lib/tax-office";

// ---- 納税証明書交付請求書（国税庁の様式・納税証明書その3）への自動入力 ----
// テンプレート（public/forms/nozei-shomei-3.pdf）にはその3のチェック・枚数・使用目的が印字済み。
// ここでは右上の枠（住所（納税地）・フリガナ・氏名・個人番号）、「◯◯税務署長 あて」の税務署名、
// 左上の代理人記入欄（住所・氏名）を書き込む。
// 代理人記入欄にはテンプレートに代理人（DEFAULT_NOZEI3_AGENT）が印字されているので、
// 白く塗って消してから画面で入れた代理人を書く（空なら空欄のまま）。
// 座標は様式を解析して特定した（A4縦 595.22×842pt。pdf-lib は左下が原点）。

export interface Nozei3FormData {
  name: string; // 氏名
  kana: string; // フリガナ
  address: string; // 住所（納税地）＝ 現在の住所
  myNumber: string; // 個人番号（12桁。無ければ空欄のまま）
  taxOfficeName: string; // 投函先の税務署名（例: 熊本東税務署）。空なら書かない
  agentAddress?: string; // 代理人記入欄の住所（空なら空欄）
  agentName?: string; // 代理人記入欄の氏名（空なら空欄）
}

// テンプレートに印字されている代理人（画面の初期値）
export const DEFAULT_NOZEI3_AGENT = {
  address: "熊本県熊本市東区小山3-8-87カームリーハウスB201",
  name: "野口明菜",
} as const;

// 代理人の氏名・住所の選択肢（選択肢に無いときは「その他」で手入力）
export const NOZEI3_AGENT_NAME_OPTIONS = ["VUONG VAN THANH", "野口明菜"] as const;
export const NOZEI3_AGENT_ADDRESS_OPTIONS = [DEFAULT_NOZEI3_AGENT.address] as const;

// 代理人記入欄で、テンプレートの印字を白く塗って消す範囲（pdf-lib の座標）。
// 住所（上端 131〜146）と氏名（上端 166〜182）。見出しの「住所」「氏名」と括弧の線は残す
export interface WhiteoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const NOZEI3_AGENT_WHITEOUT: WhiteoutRect[] = [
  { x: 66, y: 842 - 146, width: 172, height: 15 },
  { x: 66, y: 842 - 182, width: 172, height: 16 },
];

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

// 代理人記入欄の文字の左端と幅（括弧の線 x≒62〜240 の内側）
const AGENT_LEFT = 69;
const AGENT_RIGHT = 236;
const AGENT_WIDTH = AGENT_RIGHT - AGENT_LEFT;

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

  // 代理人記入欄: 住所（1行に縮小、収まらなければ2行）と氏名
  const agentAddress = (data.agentAddress ?? "").trim();
  if (agentAddress) {
    const size = fitSize(agentAddress, AGENT_WIDTH, measure, 7, 5.5);
    if (measure(agentAddress, size) <= AGENT_WIDTH) {
      items.push({ text: agentAddress, x: AGENT_LEFT, y: fromTop(140), size });
    } else {
      const [l1, l2] = splitTwoLines(agentAddress);
      const size2 = Math.min(fitSize(l1, AGENT_WIDTH, measure, 6.5, 5), fitSize(l2, AGENT_WIDTH, measure, 6.5, 5));
      items.push({ text: l1, x: AGENT_LEFT, y: fromTop(137), size: size2 });
      items.push({ text: l2, x: AGENT_LEFT, y: fromTop(144.5), size: size2 });
    }
  }
  const agentName = (data.agentName ?? "").trim();
  if (agentName) {
    const size = fitSize(agentName, AGENT_WIDTH, measure, 9, 6);
    items.push({ text: agentName, x: AGENT_LEFT, y: fromTop(177.4), size });
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
  // テンプレートに印字されている代理人を消す
  for (const r of NOZEI3_AGENT_WHITEOUT) {
    page.drawRectangle({ ...r, color: rgb(1, 1, 1) });
  }
  const items = buildNozei3DrawItems(data, (text, size) => jpFont.widthOfTextAtSize(text, size));
  for (const it of items) {
    page.drawText(it.text, { x: it.x, y: it.y, size: it.size, font: jpFont, color: rgb(0, 0, 0) });
  }
  return doc.save();
}
