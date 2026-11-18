import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { birthSeireki, birthWareki } from "@/lib/person-copy";
import { warekiDate } from "@/lib/dependents";
import { SUBMISSION_ITEMS, type SubmissionItem } from "@/lib/submission-list";

// ---- 参考様式の作成（申請書類作成をアプリ一本化計画・試験中） ----
// 参考様式（1-4号・1-5号・1-6号・1-17号・11-1号など）のひな形PDFを、様式・言語ごとに1回だけ登録し（ref_form_templates。0227）、
// 「どこに何を書くか」（記入位置）と「本人の署名が要るページ」を置いておく。
// 申請準備の詳細（一本化のページ）の提出書類一覧表から、本人・所属機関・登録支援機関の情報を書き込んだPDFを作る。
// 座標はPDFのページの左上を原点にした pt。y は文字の上端（自治体の申請書の記入位置 lib/municipal-form.ts と同じ）。

// 参考様式の行か（様式番号が「参考様式第…」「分野参考様式第…」）
export function isRefFormItem(item: Pick<SubmissionItem, "formNo">): boolean {
  return /参考様式/.test(item.formNo);
}
export const REF_FORM_ITEMS: SubmissionItem[] = SUBMISSION_ITEMS.filter(isRefFormItem);

// 様式の短い名前（例: 参考様式第1-4号）
export function refFormName(key: string): string {
  const it = SUBMISSION_ITEMS.find((i) => i.key === key);
  return it ? it.formNo.replace(/（.*$/, "") : key;
}

// ---- 言語 ----
export const REF_FORM_LANGUAGES = [
  "日本語",
  "ベトナム語",
  "クメール語",
  "インドネシア語",
  "タガログ語",
  "ミャンマー語",
  "タイ語",
  "ネパール語",
  "中国語",
  "英語",
  "モンゴル語",
  "シンハラ語",
  "ウズベク語",
  "ベンガル語",
] as const;

// 国籍 → その人が分かる言語（参考様式の言語の版を選ぶのに使う）
const NATIONALITY_LANGUAGE: [string, string][] = [
  ["ベトナム", "ベトナム語"],
  ["カンボジア", "クメール語"],
  ["インドネシア", "インドネシア語"],
  ["フィリピン", "タガログ語"],
  ["ミャンマー", "ミャンマー語"],
  ["タイ", "タイ語"],
  ["ネパール", "ネパール語"],
  ["中国", "中国語"],
  ["モンゴル", "モンゴル語"],
  ["スリランカ", "シンハラ語"],
  ["ウズベキスタン", "ウズベク語"],
  ["バングラデシュ", "ベンガル語"],
];
export function languageForNationality(nationality: string): string {
  const n = (nationality ?? "").trim();
  return NATIONALITY_LANGUAGE.find(([k]) => n.includes(k))?.[1] ?? "";
}

export interface RefFormTemplate {
  id: string;
  form_key: string; // 提出書類一覧表の書類のキー（例: t1-4-1）
  language: string;
  organization_id?: string | null; // この所属機関だけで使うひな形（null は全員共通。0228）
  pdf_path: string;
  pdf_name: string;
  layout: unknown;
  sign_pages: number[]; // 本人の署名が要るページ（0 始まり）
  updated_at?: string;
}

// その人に使うひな形。
// その所属機関の版（国籍の言語 → 日本語 → 最初のもの）→ 全員共通の版（国籍の言語 → 日本語 → 最初のもの）
export function pickRefFormTemplate<T extends Pick<RefFormTemplate, "form_key" | "language" | "organization_id">>(
  templates: T[],
  formKey: string,
  nationality: string,
  orgId?: string | null,
): T | null {
  const lang = languageForNationality(nationality);
  const pick = (list: T[]) =>
    (lang && list.find((t) => t.language === lang)) || list.find((t) => t.language === "日本語") || list[0] || null;
  const form = templates.filter((t) => t.form_key === formKey);
  const own = orgId ? form.filter((t) => t.organization_id === orgId) : [];
  return pick(own) ?? pick(form.filter((t) => !t.organization_id));
}

// アプリに入れてある入管の参考様式（何も記入していない日本語の版。public/forms/ref-forms/）。
// 画面の「アプリに入っている参考様式を登録」で、全員共通・日本語のひな形として登録する（記入位置はそのあと置く）
export const BUNDLED_REF_FORMS: Record<string, string> = {
  "t1-4-1": "t1-4-1.pdf", // 参考様式第1-4号 特定技能外国人の報酬に関する説明書
  "t1-17": "t1-17.pdf", // 参考様式第1-26号 公的義務履行に関する誓約書
  "s2-8": "s2-8.pdf", // 参考様式第1-32号 2号特定技能外国人の業務内容に関する誓約書
  "t3a-2": "t3a-2.pdf", // 分野参考様式第11-1号 農業・直接雇用の誓約書
  "t3a-4": "t3a-4.pdf", // 分野参考様式第11-4号 登録支援機関誓約書
};

// アプリに入れてある参考様式のうち、全員共通・日本語のひな形がまだ登録されていないもの
export function missingBundledRefForms(templates: Pick<RefFormTemplate, "form_key" | "language" | "organization_id">[]): string[] {
  return Object.keys(BUNDLED_REF_FORMS).filter(
    (k) => !templates.some((t) => t.form_key === k && t.language === "日本語" && !t.organization_id),
  );
}

export function normalizeSignPages(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0))].sort((a, b) => a - b);
}

// ---- 書き込む項目 ----
export type RefFormFieldKind =
  | "name"
  | "kana"
  | "birth_seireki"
  | "birth_wareki"
  | "birth_y"
  | "birth_m"
  | "birth_d"
  | "age"
  | "gender"
  | "nationality"
  | "postal"
  | "address"
  | "card_no"
  | "passport_no"
  | "org_name"
  | "org_postal"
  | "org_address"
  | "org_tel"
  | "org_rep"
  | "org_rep_kana"
  | "org_corporate_no"
  | "org_holiday_weekly"
  | "org_holiday_other"
  | "org_holiday_year_days"
  | "org_holiday_irregular_unit"
  | "org_holiday_irregular_days"
  | "org_holiday_irregular_other"
  | "so_name"
  | "so_reg_no"
  | "so_address"
  | "so_tel"
  | "so_rep"
  | "so_manager"
  | "so_staff"
  | "today"
  | "today_seireki"
  | "today_y"
  | "today_m"
  | "today_d"
  | "text"
  | "check"
  | "circle";

export const REF_FORM_FIELDS: { kind: RefFormFieldKind; label: string; sample: string; group: string }[] = [
  { kind: "name", label: "氏名", sample: "NGUYEN VAN A", group: "本人" },
  { kind: "kana", label: "フリガナ", sample: "グエン ヴァン ア", group: "本人" },
  { kind: "birth_seireki", label: "生年月日（西暦）", sample: "1995年3月8日", group: "本人" },
  { kind: "birth_wareki", label: "生年月日（和暦）", sample: "平成7年3月8日", group: "本人" },
  { kind: "birth_y", label: "生年月日の年だけ（西暦）", sample: "1995", group: "本人" },
  { kind: "birth_m", label: "生年月日の月だけ", sample: "3", group: "本人" },
  { kind: "birth_d", label: "生年月日の日だけ", sample: "8", group: "本人" },
  { kind: "age", label: "年齢（作成日の時点・数字だけ）", sample: "31", group: "本人" },
  { kind: "gender", label: "性別（男・女）", sample: "男", group: "本人" },
  { kind: "nationality", label: "国籍", sample: "ベトナム", group: "本人" },
  { kind: "postal", label: "郵便番号（本人）", sample: "〒866-0021", group: "本人" },
  { kind: "address", label: "住所（本人）", sample: "熊本県八代市郡築四番町102-7", group: "本人" },
  { kind: "card_no", label: "在留カード番号", sample: "AB12345678CD", group: "本人" },
  { kind: "passport_no", label: "パスポート番号", sample: "C1234567", group: "本人" },
  { kind: "org_name", label: "所属機関の名称", sample: "株式会社サンプル農園", group: "所属機関" },
  { kind: "org_postal", label: "所属機関の郵便番号", sample: "〒866-0000", group: "所属機関" },
  { kind: "org_address", label: "所属機関の住所", sample: "熊本県八代市本町1-1-1", group: "所属機関" },
  { kind: "org_tel", label: "所属機関の電話番号", sample: "0965-00-0000", group: "所属機関" },
  { kind: "org_rep", label: "代表者の役職・氏名", sample: "代表取締役 山田太郎", group: "所属機関" },
  { kind: "org_rep_kana", label: "代表者のフリガナ", sample: "ヤマダ タロウ", group: "所属機関" },
  { kind: "org_corporate_no", label: "法人番号", sample: "1234567890123", group: "所属機関" },
  { kind: "org_holiday_weekly", label: "休日 定例日の曜日（毎週○曜日の○）", sample: "日", group: "所属機関" },
  { kind: "org_holiday_other", label: "休日 定例日のその他", sample: "企業指定日", group: "所属機関" },
  { kind: "org_holiday_year_days", label: "休日 年間合計休日日数（数字だけ）", sample: "105", group: "所属機関" },
  { kind: "org_holiday_irregular_unit", label: "休日 非定例日の単位（週・月）", sample: "週", group: "所属機関" },
  { kind: "org_holiday_irregular_days", label: "休日 非定例日の日数（数字だけ）", sample: "2", group: "所属機関" },
  { kind: "org_holiday_irregular_other", label: "休日 非定例日のその他", sample: "シフトにより決定", group: "所属機関" },
  { kind: "so_name", label: "登録支援機関の名称", sample: "VUONG VAN THANH", group: "登録支援機関" },
  { kind: "so_reg_no", label: "登録支援機関の登録番号", sample: "20登-005746", group: "登録支援機関" },
  { kind: "so_address", label: "登録支援機関の住所", sample: "熊本県熊本市東区小山2丁目13-20", group: "登録支援機関" },
  { kind: "so_tel", label: "登録支援機関の電話番号", sample: "050-8890-4000", group: "登録支援機関" },
  { kind: "so_rep", label: "登録支援機関の代表者", sample: "VUONG VAN THANH", group: "登録支援機関" },
  { kind: "so_manager", label: "支援責任者", sample: "VUONG VAN THANH", group: "登録支援機関" },
  { kind: "so_staff", label: "支援担当者", sample: "VUONG VAN THANH", group: "登録支援機関" },
  { kind: "today", label: "作成日（令和）", sample: "令和8年11月16日", group: "日付" },
  { kind: "today_seireki", label: "作成日（西暦）", sample: "2026年11月16日", group: "日付" },
  { kind: "today_y", label: "作成日の年だけ（西暦）", sample: "2026", group: "日付" },
  { kind: "today_m", label: "作成日の月だけ", sample: "11", group: "日付" },
  { kind: "today_d", label: "作成日の日だけ", sample: "16", group: "日付" },
  { kind: "text", label: "自由な文字（毎回同じ）", sample: "（文字）", group: "そのほか" },
  { kind: "check", label: "✓ チェック", sample: "✓", group: "そのほか" },
  { kind: "circle", label: "○ 丸", sample: "○", group: "そのほか" },
];
export const REF_FORM_FIELD_LABEL = Object.fromEntries(REF_FORM_FIELDS.map((f) => [f.kind, f.label])) as Record<RefFormFieldKind, string>;

export interface RefFormItem {
  id: string;
  kind: RefFormFieldKind;
  page: number; // 0 始まり
  x: number;
  y: number;
  size: number;
  text?: string;
  maxWidth?: number;
}

export function normalizeRefFormLayout(v: unknown): RefFormItem[] {
  if (!Array.isArray(v)) return [];
  const kinds = new Set(REF_FORM_FIELDS.map((f) => f.kind));
  const out: RefFormItem[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== "string" || !kinds.has(o.kind as RefFormFieldKind)) continue;
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : `i${out.length}`,
      kind: o.kind as RefFormFieldKind,
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

// 書き込む情報
export interface RefFormData {
  person: {
    name: string;
    kana: string;
    birth: string | null; // YYYY-MM-DD
    gender: string;
    nationality: string;
    postalCode: string; // 数字7桁
    address: string;
    cardNo: string;
    passportNo: string;
  };
  org: {
    name: string;
    postalCode: string;
    address: string;
    tel: string;
    rep: string;
    repKana: string;
    corporateNo: string;
    // 休日（所属機関 ＞ 求人票に記載する内容 6. 休日）。無い時は ''
    holidayWeekly?: string;
    holidayOther?: string;
    holidayYearDays?: string;
    holidayIrregularUnit?: string;
    holidayIrregularDays?: string;
    holidayIrregularOther?: string;
  };
  so: { name: string; regNo: string; address: string; tel: string; rep: string; manager: string; staff: string };
  today: string; // YYYY-MM-DD
}

const postal = (v: string) => {
  const d = (v ?? "").replace(/[^\d]/g, "");
  return d.length === 7 ? `〒${d.slice(0, 3)}-${d.slice(3)}` : "";
};
const ymd = (v: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : null;
};

export function refFormValue(item: Pick<RefFormItem, "kind" | "text">, data: RefFormData): string {
  const p = data.person;
  const b = ymd(p.birth);
  const t = ymd(data.today);
  switch (item.kind) {
    case "name":
      return p.name;
    case "kana":
      return p.kana;
    case "birth_seireki":
      return birthSeireki(p.birth);
    case "birth_wareki":
      return birthWareki(p.birth);
    case "birth_y":
      return b?.y ?? "";
    case "birth_m":
      return b?.m ?? "";
    case "birth_d":
      return b?.d ?? "";
    case "age": {
      // 作成日の時点の満年齢（誕生日の前日までは1つ少ない）
      if (!b || !t) return "";
      const before = Number(t.m) < Number(b.m) || (t.m === b.m && Number(t.d) < Number(b.d));
      const age = Number(t.y) - Number(b.y) - (before ? 1 : 0);
      return age >= 0 ? String(age) : "";
    }
    case "gender":
      return p.gender;
    case "nationality":
      return p.nationality;
    case "postal":
      return postal(p.postalCode);
    case "address":
      return p.address;
    case "card_no":
      return p.cardNo;
    case "passport_no":
      return p.passportNo;
    case "org_name":
      return data.org.name;
    case "org_postal":
      return postal(data.org.postalCode);
    case "org_address":
      return data.org.address;
    case "org_tel":
      return data.org.tel;
    case "org_rep":
      return data.org.rep;
    case "org_rep_kana":
      return data.org.repKana;
    case "org_corporate_no":
      return data.org.corporateNo;
    case "org_holiday_weekly":
      return data.org.holidayWeekly ?? "";
    case "org_holiday_other":
      return data.org.holidayOther ?? "";
    case "org_holiday_year_days":
      return data.org.holidayYearDays ?? "";
    case "org_holiday_irregular_unit":
      return data.org.holidayIrregularUnit ?? "";
    case "org_holiday_irregular_days":
      return data.org.holidayIrregularDays ?? "";
    case "org_holiday_irregular_other":
      return data.org.holidayIrregularOther ?? "";
    case "so_name":
      return data.so.name;
    case "so_reg_no":
      return data.so.regNo;
    case "so_address":
      return data.so.address;
    case "so_tel":
      return data.so.tel;
    case "so_rep":
      return data.so.rep;
    case "so_manager":
      return data.so.manager;
    case "so_staff":
      return data.so.staff;
    case "today":
      return warekiDate(data.today);
    case "today_seireki":
      return t ? `${t.y}年${t.m}月${t.d}日` : "";
    case "today_y":
      return t?.y ?? "";
    case "today_m":
      return t?.m ?? "";
    case "today_d":
      return t?.d ?? "";
    case "text":
      return item.text ?? "";
    default:
      return "";
  }
}

// 見本（記入位置の確認用）
export const REF_FORM_SAMPLE_DATA: RefFormData = {
  person: {
    name: "NGUYEN VAN A",
    kana: "グエン ヴァン ア",
    birth: "1995-03-08",
    gender: "男",
    nationality: "ベトナム",
    postalCode: "8660021",
    address: "熊本県八代市郡築四番町102-7 サンプルハイツ101",
    cardNo: "AB12345678CD",
    passportNo: "C1234567",
  },
  org: {
    name: "株式会社サンプル農園",
    postalCode: "8660000",
    address: "熊本県八代市本町1-1-1",
    tel: "0965-00-0000",
    rep: "代表取締役 山田太郎",
    repKana: "ヤマダ タロウ",
    corporateNo: "1234567890123",
    holidayWeekly: "日",
    holidayOther: "企業指定日",
    holidayYearDays: "105",
    holidayIrregularUnit: "週",
    holidayIrregularDays: "2",
    holidayIrregularOther: "シフトにより決定",
  },
  so: {
    name: "VUONG VAN THANH",
    regNo: "20登-005746",
    address: "熊本県熊本市東区小山2丁目13-20 日産共同住宅201号",
    tel: "050-8890-4000",
    rep: "VUONG VAN THANH",
    manager: "VUONG VAN THANH",
    staff: "VUONG VAN THANH",
  },
  today: "",
};

function drawItem(page: PDFPage, font: PDFFont, item: RefFormItem, data: RefFormData) {
  const black = rgb(0, 0, 0);
  const { height } = page.getSize();
  if (item.kind === "check") {
    const s = item.size;
    const x = item.x;
    const top = height - item.y;
    page.drawLine({ start: { x, y: top - s * 0.55 }, end: { x: x + s * 0.35, y: top - s }, thickness: Math.max(1, s / 8), color: black });
    page.drawLine({ start: { x: x + s * 0.35, y: top - s }, end: { x: x + s, y: top }, thickness: Math.max(1, s / 8), color: black });
    return;
  }
  if (item.kind === "circle") {
    const r = item.size / 2;
    page.drawEllipse({ x: item.x + r, y: height - item.y - r, xScale: r, yScale: r, borderColor: black, borderWidth: Math.max(0.8, item.size / 18) });
    return;
  }
  const text = refFormValue(item, data).replace(/\s+/g, " ").trim();
  if (!text) return;
  let size = item.size;
  if (item.maxWidth) {
    while (size > 5 && font.widthOfTextAtSize(text, size) > item.maxWidth) size -= 0.5;
  }
  const ascent = font.heightAtSize(size, { descender: false });
  page.drawText(text, { x: item.x, y: height - item.y - ascent, size, font, color: black });
}

// ひな形1つに書き込む
export async function fillRefForm(
  pdfBytes: Uint8Array | ArrayBuffer,
  fontBytes: Uint8Array | ArrayBuffer,
  layout: RefFormItem[],
  data: RefFormData,
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const pages = doc.getPages();
  for (const item of layout) {
    const page = pages[item.page];
    if (page) drawItem(page, font, item, data);
  }
  return doc;
}

// 書き込んだ様式を1つのPDFにまとめる。onlyPages を渡すと、その様式のそのページだけ（署名ページ）
export async function mergeRefForms(parts: { doc: PDFDocument; onlyPages?: number[] }[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const count = part.doc.getPageCount();
    const idx = (part.onlyPages ?? Array.from({ length: count }, (_, i) => i)).filter((i) => i >= 0 && i < count);
    if (idx.length === 0) continue;
    const copied = await out.copyPages(part.doc, idx);
    for (const p of copied) out.addPage(p);
  }
  return out.save();
}

// ダウンロードの種類: one = その様式だけ / all = 「有」の参考様式を一気に / sign = 署名ページだけ
export type RefFormMode = "one" | "all" | "sign";
export function parseRefFormMode(v: unknown): RefFormMode {
  return v === "all" || v === "sign" ? v : "one";
}

export function refFormFileName(mode: RefFormMode, workerName: string, formKey?: string): string {
  const clean = (s: string) => (s ?? "").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
  const what = mode === "all" ? "参考様式一式" : mode === "sign" ? "署名ページ" : refFormName(formKey ?? "");
  return `${[clean(workerName), what].filter(Boolean).join("_")}.pdf`;
}

// 署名ページだけのときは署名ページの印が無い様式を入れない
export function refFormPagesFor(mode: RefFormMode, signPages: number[]): number[] | undefined {
  return mode === "sign" ? signPages : undefined;
}

export const REF_FORM_MIGRATION = "0227_ref_form_templates.sql";

