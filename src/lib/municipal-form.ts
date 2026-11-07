import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { birthSeireki, birthWareki } from "@/lib/person-copy";
import { warekiDate } from "@/lib/dependents";

// ---- 自治体の申請書（課税・納税証明書の交付請求書）PDFへの自動入力 ----
// 自治体マスタに申請書のPDFをアップロードし、「記入位置」（どこに何を書くか）を一度だけ画面で置いておくと、
// 証明書類の請求で外国人を選んだときに、氏名・フリガナ・生年月日・住所などをその位置に書き込んだPDFを作る。
// 様式は自治体ごとに違うので、位置は自治体ごとに保存する（municipalities.cert_form_layout）。
// 座標はPDFのページの左上を原点にした pt（1pt = 1/72インチ）。y は文字の上端。

export type MunicipalFormFieldKind =
  | "name"
  | "kana"
  | "birth_seireki"
  | "birth_wareki"
  | "nationality"
  | "postal"
  | "address"
  | "year_address"
  | "fiscal_year"
  | "income_year"
  | "fiscal_year_num"
  | "income_year_num"
  | "today"
  | "text"
  | "check"
  | "circle";

export const MUNICIPAL_FORM_FIELDS: { kind: MunicipalFormFieldKind; label: string; sample: string }[] = [
  { kind: "name", label: "氏名", sample: "NGUYEN VAN A" },
  { kind: "kana", label: "フリガナ", sample: "グエン ヴァン ア" },
  { kind: "birth_seireki", label: "生年月日（西暦）", sample: "1995年3月8日" },
  { kind: "birth_wareki", label: "生年月日（和暦）", sample: "平成7年3月8日" },
  { kind: "nationality", label: "国籍", sample: "ベトナム" },
  { kind: "postal", label: "郵便番号（現在の住所）", sample: "〒866-0021" },
  { kind: "address", label: "現在の住所", sample: "熊本県八代市郡築四番町102-7" },
  { kind: "year_address", label: "その年度の1月1日の住所", sample: "熊本県八代市本町1-1-1" },
  { kind: "fiscal_year", label: "年度（令和○年度）", sample: "令和8年度" },
  { kind: "income_year", label: "所得の年（令和○年中）", sample: "令和7年中" },
  { kind: "fiscal_year_num", label: "年度の数字だけ（「令和　年度」の空欄用）", sample: "8" },
  { kind: "income_year_num", label: "所得の年の数字だけ（「令和　年中」の空欄用）", sample: "7" },
  { kind: "today", label: "請求日（今日）", sample: "令和8年11月7日" },
  { kind: "text", label: "自由な文字（毎回同じ）", sample: "在留資格の手続きのため" },
  { kind: "check", label: "✓ チェック", sample: "✓" },
  { kind: "circle", label: "○ 丸で囲む", sample: "○" },
];

export const MUNICIPAL_FORM_FIELD_LABEL = Object.fromEntries(MUNICIPAL_FORM_FIELDS.map((f) => [f.kind, f.label])) as Record<
  MunicipalFormFieldKind,
  string
>;

export interface MunicipalFormItem {
  id: string;
  kind: MunicipalFormFieldKind;
  page: number; // 0 始まり
  x: number; // 左端（pt・ページの左上が原点）
  y: number; // 文字の上端（pt・ページの左上が原点）。✓・○は図形の上端
  size: number; // 文字の大きさ（pt）。✓・○は図形の大きさ
  text?: string; // kind = text のときの文字
  maxWidth?: number; // この幅を超えるときは文字を小さくする（pt。無ければ縮めない）
}

// 保存されている記入位置（jsonb）を読む。壊れた行は捨てる
export function normalizeMunicipalFormLayout(v: unknown): MunicipalFormItem[] {
  if (!Array.isArray(v)) return [];
  const kinds = new Set(MUNICIPAL_FORM_FIELDS.map((f) => f.kind));
  const out: MunicipalFormItem[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== "string" || !kinds.has(o.kind as MunicipalFormFieldKind)) continue;
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : `i${out.length}`,
      kind: o.kind as MunicipalFormFieldKind,
      page: Math.max(0, Math.round(num(o.page, 0))),
      x: num(o.x, 0),
      y: num(o.y, 0),
      size: Math.min(40, Math.max(4, num(o.size, 10))),
      text: typeof o.text === "string" ? o.text : undefined,
      maxWidth: typeof o.maxWidth === "number" && o.maxWidth > 0 ? o.maxWidth : undefined,
    });
  }
  return out;
}

// 書き込む本人の情報
export interface MunicipalFormPerson {
  name: string;
  kana: string;
  birth: string | null; // YYYY-MM-DD
  nationality: string;
  postalCode: string; // 数字7桁（無ければ ''）
  address: string; // 現在の住所
  yearAddress: string; // その年度の1月1日時点の住所（無ければ ''）
  fiscalYear: number | null; // 年度の開始年（西暦。例: 2026 = 令和8年度）
  today: string; // YYYY-MM-DD
}

const reiwa = (y: number) => (y - 2018 === 1 ? "令和元" : `令和${y - 2018}`);

// 項目に書く文字（✓・○は ''）
export function municipalFormValue(item: Pick<MunicipalFormItem, "kind" | "text">, p: MunicipalFormPerson): string {
  switch (item.kind) {
    case "name":
      return p.name;
    case "kana":
      return p.kana;
    case "birth_seireki":
      return birthSeireki(p.birth);
    case "birth_wareki":
      return birthWareki(p.birth);
    case "nationality":
      return p.nationality;
    case "postal": {
      const d = p.postalCode.replace(/\D/g, "");
      return d.length === 7 ? `〒${d.slice(0, 3)}-${d.slice(3)}` : "";
    }
    case "address":
      return p.address;
    case "year_address":
      return p.yearAddress || p.address;
    case "fiscal_year":
      return p.fiscalYear ? `${reiwa(p.fiscalYear)}年度` : "";
    case "income_year":
      return p.fiscalYear ? `${reiwa(p.fiscalYear - 1)}年中` : "";
    case "fiscal_year_num":
      return p.fiscalYear ? String(p.fiscalYear - 2018) : "";
    case "income_year_num":
      return p.fiscalYear ? String(p.fiscalYear - 2019) : "";
    case "today":
      return warekiDate(p.today);
    case "text":
      return item.text ?? "";
    default:
      return "";
  }
}

// 申請書のPDFに記入位置どおりに書き込む。layout が空で、PDFに入力欄（フォーム）があれば、
// 欄の名前（氏名・フリガナ・住所・生年月日など）から推測して入れる
export async function fillMunicipalForm(
  pdfBytes: Uint8Array | ArrayBuffer,
  fontBytes: Uint8Array | ArrayBuffer,
  layout: MunicipalFormItem[],
  person: MunicipalFormPerson,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const pages = doc.getPages();
  const black = rgb(0, 0, 0);

  if (layout.length === 0) {
    fillAcroFormByName(doc, person, font);
  }

  for (const item of layout) {
    const page = pages[item.page];
    if (!page) continue;
    const { height } = page.getSize();
    if (item.kind === "check") {
      // ✓ を2本の線で描く（フォントに✓が無くても描けるように）
      const s = item.size;
      const x = item.x;
      const top = height - item.y;
      page.drawLine({ start: { x, y: top - s * 0.55 }, end: { x: x + s * 0.35, y: top - s }, thickness: Math.max(1, s / 8), color: black });
      page.drawLine({ start: { x: x + s * 0.35, y: top - s }, end: { x: x + s, y: top }, thickness: Math.max(1, s / 8), color: black });
      continue;
    }
    if (item.kind === "circle") {
      const r = item.size / 2;
      page.drawEllipse({ x: item.x + r, y: height - item.y - r, xScale: r, yScale: r, borderColor: black, borderWidth: Math.max(0.8, item.size / 18) });
      continue;
    }
    const text = municipalFormValue(item, person).replace(/\s+/g, " ").trim();
    if (!text) continue;
    let size = item.size;
    if (item.maxWidth) {
      while (size > 5 && font.widthOfTextAtSize(text, size) > item.maxWidth) size -= 0.5;
    }
    // y は文字の上端。pdf-lib はベースラインなので、文字の高さぶん下げる
    const ascent = font.heightAtSize(size, { descender: false });
    page.drawText(text, { x: item.x, y: height - item.y - ascent, size, font, color: black });
  }
  return doc.save();
}

// PDFの入力欄（AcroForm）の名前から入れる値を推測する
export function guessAcroFieldKind(fieldName: string): MunicipalFormFieldKind | null {
  const n = fieldName.replace(/\s/g, "");
  if (/フリガナ|ふりがな|カナ/.test(n)) return "kana";
  if (/生年月日|誕生/.test(n)) return "birth_wareki";
  if (/郵便/.test(n)) return "postal";
  if (/住所|所在/.test(n)) return "address";
  if (/国籍/.test(n)) return "nationality";
  if (/氏名|名前|申請者名|請求者名/.test(n)) return "name";
  if (/年度/.test(n)) return "fiscal_year";
  if (/請求日|申請日|記入日|日付/.test(n)) return "today";
  return null;
}

function fillAcroFormByName(doc: PDFDocument, person: MunicipalFormPerson, font: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  let form;
  try {
    form = doc.getForm();
  } catch {
    return;
  }
  let filled = false;
  for (const field of form.getFields()) {
    const kind = guessAcroFieldKind(field.getName());
    if (!kind) continue;
    const value = municipalFormValue({ kind }, person);
    if (!value) continue;
    try {
      const tf = form.getTextField(field.getName());
      tf.setText(value);
      filled = true;
    } catch {
      // テキスト欄でなければ飛ばす
    }
  }
  if (filled) {
    try {
      form.updateFieldAppearances(font);
    } catch {
      // 見た目の更新に失敗しても値は入っている
    }
  }
}
