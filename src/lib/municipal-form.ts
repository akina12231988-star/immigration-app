import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { birthSeireki, birthWareki } from "@/lib/person-copy";
import { warekiDate, warekiParts } from "@/lib/dependents";

// ---- 自治体の申請書（課税・納税証明書の交付請求書）PDFへの自動入力 ----
// 自治体マスタに申請書のPDFをアップロードし、「記入位置」（どこに何を書くか）を一度だけ画面で置いておくと、
// 証明書類の請求で外国人を選んだときに、氏名・フリガナ・生年月日・住所などをその位置に書き込んだPDFを作る。
// 様式は自治体ごとに違うので、位置は自治体ごとに保存する（municipalities.cert_form_layout）。
// 座標はPDFのページの左上を原点にした pt（1pt = 1/72インチ）。y は文字の上端。

// 自治体ごとに登録できる書類（申請書・委任状）と、その保存先の列
export type MunicipalFormDoc = "cert" | "proxy";
export const MUNICIPAL_FORM_DOCS: Record<
  MunicipalFormDoc,
  { label: string; pathCol: "cert_form_pdf_path" | "proxy_form_pdf_path"; nameCol: "cert_form_pdf_name" | "proxy_form_pdf_name"; layoutCol: "cert_form_layout" | "proxy_form_layout" }
> = {
  cert: { label: "申請書", pathCol: "cert_form_pdf_path", nameCol: "cert_form_pdf_name", layoutCol: "cert_form_layout" },
  proxy: { label: "委任状", pathCol: "proxy_form_pdf_path", nameCol: "proxy_form_pdf_name", layoutCol: "proxy_form_layout" },
};
export function parseMunicipalFormDoc(v: unknown): MunicipalFormDoc {
  return v === "proxy" ? "proxy" : "cert";
}

export type MunicipalFormFieldKind =
  | "name"
  | "kana"
  | "birth_seireki"
  | "birth_wareki"
  | "birth_era"
  | "birth_y"
  | "birth_m"
  | "birth_d"
  | "birth_era_circle_showa"
  | "birth_era_circle_heisei"
  | "nationality"
  | "postal"
  | "address"
  | "year_address"
  | "address_after_city"
  | "year_address_after_city"
  | "fiscal_year"
  | "income_year"
  | "fiscal_year_num"
  | "income_year_num"
  | "today"
  | "today_y"
  | "today_m"
  | "today_d"
  | "text"
  | "check"
  | "circle";

export const MUNICIPAL_FORM_FIELDS: { kind: MunicipalFormFieldKind; label: string; sample: string }[] = [
  { kind: "name", label: "氏名", sample: "NGUYEN VAN A" },
  { kind: "kana", label: "フリガナ", sample: "グエン ヴァン ア" },
  { kind: "birth_seireki", label: "生年月日（西暦）", sample: "1995年3月8日" },
  { kind: "birth_wareki", label: "生年月日（和暦）", sample: "平成7年3月8日" },
  { kind: "birth_era", label: "生年月日の元号だけ（平成 など）", sample: "平成" },
  { kind: "birth_y", label: "生年月日の年だけ（和暦の数字）", sample: "7" },
  { kind: "birth_m", label: "生年月日の月だけ", sample: "3" },
  { kind: "birth_d", label: "生年月日の日だけ", sample: "8" },
  { kind: "birth_era_circle_showa", label: "○ 元号の「昭」（昭和生まれなら丸）", sample: "○" },
  { kind: "birth_era_circle_heisei", label: "○ 元号の「平」（平成生まれなら丸）", sample: "○" },
  { kind: "nationality", label: "国籍", sample: "ベトナム" },
  { kind: "postal", label: "郵便番号（現在の住所）", sample: "〒866-0021" },
  { kind: "address", label: "現在の住所", sample: "熊本県八代市郡築四番町102-7" },
  { kind: "year_address", label: "その年度の1月1日の住所", sample: "熊本県八代市本町1-1-1" },
  { kind: "address_after_city", label: "現在の住所（市区町村より後だけ）", sample: "郡築四番町102-7" },
  { kind: "year_address_after_city", label: "1月1日の住所（市区町村より後だけ）", sample: "本町1-1-1" },
  { kind: "fiscal_year", label: "年度（令和○年度）", sample: "令和8年度" },
  { kind: "income_year", label: "所得の年（令和○年中）", sample: "令和7年中" },
  { kind: "fiscal_year_num", label: "年度の数字だけ（「令和　年度」の空欄用）", sample: "8" },
  { kind: "income_year_num", label: "所得の年の数字だけ（「令和　年中」の空欄用）", sample: "7" },
  { kind: "today", label: "請求日（今日）", sample: "令和8年11月7日" },
  { kind: "today_y", label: "請求日の年だけ（令和の数字）", sample: "8" },
  { kind: "today_m", label: "請求日の月だけ", sample: "11" },
  { kind: "today_d", label: "請求日の日だけ", sample: "7" },
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

// 申請書に「八代市」などの市区町村名が印字されているときに使う、市区町村より後の住所。
// 都道府県と最初の市・区・町・村までを取り除く（郡は町村の前なので「八代郡氷川町」は氷川町まで取る）
export function addressAfterCity(address: string): string {
  const a = address.trim();
  const pref = /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.exec(a);
  const rest = pref ? a.slice(pref[0].length) : a;
  // 市 → 郡の町村 → 東京23区 → 町村 の順に探す（「郡築」のような地名の郡に引っかからないよう、市を先に見る）
  const m = /^.+?市/.exec(rest) ?? /^.+?郡.+?[町村]/.exec(rest) ?? /^.+?区/.exec(rest) ?? /^.+?[町村]/.exec(rest);
  return m ? rest.slice(m[0].length).trim() : rest;
}

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
    case "birth_era":
      return warekiParts(p.birth)?.eraLong ?? "";
    case "birth_y": {
      const w = warekiParts(p.birth);
      return w ? String(w.year) : "";
    }
    case "birth_m":
      return warekiParts(p.birth) ? String(warekiParts(p.birth)!.month) : "";
    case "birth_d":
      return warekiParts(p.birth) ? String(warekiParts(p.birth)!.day) : "";
    case "today_y": {
      const w = warekiParts(p.today);
      return w ? String(w.year) : "";
    }
    case "today_m":
      return warekiParts(p.today) ? String(warekiParts(p.today)!.month) : "";
    case "today_d":
      return warekiParts(p.today) ? String(warekiParts(p.today)!.day) : "";
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
    case "address_after_city":
      return addressAfterCity(p.address);
    case "year_address_after_city":
      return addressAfterCity(p.yearAddress || p.address);
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
    // 元号の丸は、生年月日の元号が合うときだけ描く（昭・平の両方に置いておけば、その人の方だけ丸になる）
    if (item.kind === "birth_era_circle_showa" || item.kind === "birth_era_circle_heisei") {
      const era = warekiParts(person.birth)?.eraLong ?? "";
      if (era !== (item.kind === "birth_era_circle_showa" ? "昭和" : "平成")) continue;
    }
    if (item.kind === "circle" || item.kind === "birth_era_circle_showa" || item.kind === "birth_era_circle_heisei") {
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
