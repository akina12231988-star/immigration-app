import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { birthSeireki, birthWareki } from "@/lib/person-copy";
import { warekiDate } from "@/lib/dependents";
import { SUBMISSION_ITEMS, type SubmissionItem } from "@/lib/submission-list";
import { PLAN_DATE_FIELDS, type PlanDateKey } from "@/lib/support-plan-dates";
import { calcWageDetail, fixedOtOverHours, formatYen, normalizeWageDetail } from "@/lib/wage-calc";
import { P117_FIELDS, type P117Key } from "@/lib/ref-form-117";

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
  if (key in EXTRA_REF_FORMS) return EXTRA_REF_FORMS[key];
  const it = SUBMISSION_ITEMS.find((i) => i.key === key);
  return it ? it.formNo.replace(/（.*$/, "") : key;
}

// 提出書類一覧表に無いが、同じ「ひな形・記入位置」の仕組みで作る様式（キー → 名前）
export const EXTRA_REF_FORMS: Record<string, string> = {
  nozei3: "納税証明書交付請求書（その3）",
};
export const NOZEI3_REF_FORM_KEY = "nozei3";

// ひな形を登録できる様式のキーか
export function isRefFormKey(key: string): boolean {
  return key in EXTRA_REF_FORMS || REF_FORM_ITEMS.some((i) => i.key === key);
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

// ---- 1-6号別紙（賃金の支払）の値 ----
// 金額はすべて3桁ごとにカンマ（「約」は様式に書いてあるので付けない）
export const W6_FIELDS = [
  { key: "hourly", label: "1時間当たりの金額（月給・日給のとき）", sample: "1,098" },
  { key: "monthly", label: "1か月当たりの金額（日給・時給のとき）", sample: "191,400" },
  ...[1, 2, 3, 4].flatMap((n) => {
    const c = String.fromCharCode(96 + n);
    return [
      { key: `allow${n}_name`, label: `手当(${c})の名前`, sample: ["通勤", "住宅", "皆勤", "資格"][n - 1] },
      { key: `allow${n}_amount`, label: `手当(${c})の金額`, sample: ["5,000", "10,000", "3,000", "2,000"][n - 1] },
      { key: `allow${n}_method`, label: `手当(${c})の計算方法`, sample: ["実費（上限5,000円）", "毎月定額", "欠勤なしの月に支給", "毎月定額"][n - 1] },
    ];
  }),
  { key: "ot_name", label: "固定残業代の手当の名前（(e)「　手当」）", sample: "固定残業" },
  { key: "ot_amount", label: "固定残業代の金額", sample: "20,000" },
  { key: "ot_hours", label: "固定残業代の時間数（〇時間分の時間外手当）", sample: "15" },
  { key: "ot_over_hours", label: "固定残業代の「〇時間を超える」時間数", sample: "15" },
  { key: "allow_total", label: "諸手当の合計", sample: "5,000" },
  { key: "gross", label: "3. 1か月当たりの支払概算額", sample: "196,000" },
  { key: "tax", label: "4(a) 税金", sample: "3,010" },
  { key: "social", label: "4(b) 社会保険料", sample: "27,323" },
  { key: "employment", label: "4(c) 雇用保険料", sample: "955" },
  { key: "food", label: "4(d) 食費", sample: "0" },
  { key: "housing", label: "4(e) 居住費", sample: "20,000" },
  { key: "housing_note", label: "4(e) 居住費の算定方法・説明", sample: "家賃÷入居人数" },
  { key: "utility", label: "4(f) その他（水道光熱費）", sample: "0" },
  { key: "other1_name", label: "その他控除1の名前", sample: "通信費" },
  { key: "other1_amount", label: "その他控除1の金額", sample: "2,000" },
  { key: "other2_name", label: "その他控除2の名前", sample: "寮の備品代" },
  { key: "other2_amount", label: "その他控除2の金額", sample: "1,000" },
  { key: "deduct_total", label: "控除する金額（合計）", sample: "51,288" },
  { key: "net", label: "5. 手取り支給額", sample: "144,712" },
] as const;
export type W6Key = (typeof W6_FIELDS)[number]["key"];

// 賃金（区分・金額）と1-6号別紙の内容から、置く項目の値を出す（画面の「約〇〇円」と同じ計算）。
// annualHours は所属機関の年間所定労働時間（別紙に入れていないときに使う）
export function refFormWage6Values(
  wage: { kind: string; amount: number },
  rawDetail: unknown,
  annualHours: number,
): Record<string, string> {
  const detail = normalizeWageDetail(rawDetail);
  const r = calcWageDetail(wage, detail, annualHours);
  const y = (n: number) => formatYen(n);
  const out: Record<string, string> = {
    hourly:
      wage.kind === "月給" && r.annualHours > 0
        ? y((wage.amount * 12) / r.annualHours)
        : wage.kind === "日給"
          ? y(wage.amount / 8)
          : "",
    monthly: (wage.kind === "日給" || wage.kind === "時給") && r.base > 0 ? y(r.base) : "",
    allow_total: y(r.allowanceTotal),
    gross: y(r.gross),
    tax: y(r.tax),
    social: y(r.social),
    employment: y(r.employment),
    food: y(r.food),
    housing: y(r.housing),
    housing_note: detail.housing_note ?? "",
    utility: y(r.utility),
    deduct_total: y(r.deductTotal),
    net: y(r.net),
    ot_amount: detail.fixed_ot_enabled ? y(detail.fixed_ot_amount) : "",
    ot_hours: detail.fixed_ot_enabled && detail.fixed_ot_hours ? String(detail.fixed_ot_hours) : "",
    ot_name: detail.fixed_ot_enabled ? detail.fixed_ot_name : "",
    ot_over_hours: detail.fixed_ot_enabled && fixedOtOverHours(detail) ? String(fixedOtOverHours(detail)) : "",
  };
  detail.allowances.slice(0, 4).forEach((a, i) => {
    out[`allow${i + 1}_name`] = a.name || a.type;
    out[`allow${i + 1}_amount`] = y(a.amount);
    out[`allow${i + 1}_method`] = a.method;
  });
  detail.others.slice(0, 2).forEach((o, i) => {
    out[`other${i + 1}_name`] = o.name;
    out[`other${i + 1}_amount`] = y(o.amount);
  });
  return out;
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
  | "doc_date"
  | "doc_date_seireki"
  | "doc_y"
  | "doc_m"
  | "doc_d"
  | `plan_${PlanDateKey}`
  | "docall_y"
  | "my_number"
  | "tax_office"
  | "tax_office_full"
  | "agent_name"
  | "agent_address"
  | "docall_m"
  | "docall_d"
  | "wage_amount"
  | "wage_monthly"
  | "wage_daily"
  | "wage_hourly"
  | "mark_monthly"
  | "mark_daily"
  | "mark_hourly"
  | `w6_${W6Key}`
  | `p117_${P117Key}`
  | "text"
  | "check"
  | "circle"
  | "circle_male"
  | "circle_female";

export const REF_FORM_FIELDS: { kind: RefFormFieldKind; label: string; sample: string; group: string; hidden?: boolean }[] = [
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
  // 申請準備の「支援計画書の日付」の書類作成日（全様式共通）。保存していなければ空欄
  { hidden: true, kind: "doc_date", label: "書類作成日（令和）", sample: "令和8年11月14日", group: "日付" },
  { hidden: true, kind: "doc_date_seireki", label: "書類作成日（西暦）", sample: "2026年11月14日", group: "日付" },
  { hidden: true, kind: "doc_y", label: "書類作成日の年だけ（西暦）", sample: "2026", group: "日付" },
  { hidden: true, kind: "doc_m", label: "書類作成日の月だけ", sample: "11", group: "日付" },
  { hidden: true, kind: "doc_d", label: "書類作成日の日だけ", sample: "14", group: "日付" },
  // 申請準備の「支援計画書の日付」の日付。置いたあとに「書き方」（令和・西暦・年・月・日）を選ぶ
  ...PLAN_DATE_FIELDS.map((f) => ({
    kind: `plan_${f.key}` as RefFormFieldKind,
    label: f.label,
    sample: "2026年11月14日",
    group: "支援計画書の日付",
  })),
  // 書類作成日（全様式共通）は「　年　月　日」の欄に置くことが多いので、年・月・日を別の項目でも出す
  { kind: "docall_y", label: "書類作成日（全様式共通）の年だけ（西暦）", sample: "2026", group: "支援計画書の日付" },
  { kind: "docall_m", label: "書類作成日（全様式共通）の月だけ", sample: "11", group: "支援計画書の日付" },
  { kind: "docall_d", label: "書類作成日（全様式共通）の日だけ", sample: "15", group: "支援計画書の日付" },
  // 賃金（外国人詳細の「賃金（1-6号別紙）」の現在の記録）。金額は 3桁ごとにカンマ
  { kind: "wage_amount", label: "賃金の金額（月給・日給・時給どれでも）", sample: "220,000", group: "賃金" },
  { kind: "wage_monthly", label: "月給の金額（月給のときだけ）", sample: "220,000", group: "賃金" },
  { kind: "wage_daily", label: "日給の金額（日給のときだけ）", sample: "9,000", group: "賃金" },
  { kind: "wage_hourly", label: "時給の金額（時給のときだけ）", sample: "1,100", group: "賃金" },
  { kind: "mark_monthly", label: "■ 月給のときだけ（□を塗る）", sample: "■", group: "賃金" },
  { kind: "mark_daily", label: "■ 日給のときだけ（□を塗る）", sample: "■", group: "賃金" },
  { kind: "mark_hourly", label: "■ 時給のときだけ（□を塗る）", sample: "■", group: "賃金" },
  // 1-6号別紙（賃金の支払）。外国人詳細の「賃金（1-6号別紙）」で保存した内容から計算する
  ...W6_FIELDS.map((f) => ({ kind: `w6_${f.key}` as RefFormFieldKind, label: f.label, sample: f.sample, group: "1-6号別紙（賃金の支払）" })),
  // 1-17号 支援計画書に記載する項目（申請準備の「１－１７号の…記載する項目」と同じ値）
  ...P117_FIELDS.map((f) => ({ kind: `p117_${f.key}` as RefFormFieldKind, label: f.label, sample: f.sample, group: "1-17号 支援計画書" })),
  // 証明書類の請求（税務署の納税証明書交付請求書など）で使う項目
  { kind: "my_number", label: "個人番号（1マスに1文字・左詰め）", sample: "123456789012", group: "証明書類の請求" },
  { kind: "tax_office", label: "税務署名（「税務署」を除く。例: 八代）", sample: "八代", group: "証明書類の請求" },
  { kind: "tax_office_full", label: "税務署名（例: 八代税務署）", sample: "八代税務署", group: "証明書類の請求" },
  { kind: "agent_name", label: "代理人の氏名", sample: "野口明菜", group: "証明書類の請求" },
  { kind: "agent_address", label: "代理人の住所", sample: "熊本県熊本市東区小山3-8-87", group: "証明書類の請求" },
  { kind: "text", label: "自由な文字（毎回同じ）", sample: "（文字）", group: "そのほか" },
  { kind: "check", label: "✓ チェック", sample: "✓", group: "そのほか" },
  { kind: "circle", label: "○ 丸", sample: "○", group: "そのほか" },
  // 性別で○の位置を変える。「男」と「女」の両方に置いておくと、本人の性別の方だけ書き込む
  { kind: "circle_male", label: "○ 丸（男のときだけ）", sample: "○", group: "そのほか" },
  { kind: "circle_female", label: "○ 丸（女のときだけ）", sample: "○", group: "そのほか" },
];
// 自由な文字を置いたときの見本。文字を入れないままなら PDF には何も書かない
export const REF_FORM_TEXT_PLACEHOLDER = "（文字）";
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
  fmt?: RefFormDateFmt; // 支援計画書の日付の書き方（無ければ西暦）
  cell?: number; // 個人番号の1マスの幅（pt）。置いた位置から右へ1マスに1文字ずつ書く
}

// 支援計画書の日付の書き方
export type RefFormDateFmt = "wareki" | "seireki" | "y" | "m" | "d";
export const REF_FORM_DATE_FMTS: { value: RefFormDateFmt; label: string; sample: string }[] = [
  { value: "seireki", label: "西暦（2026年11月14日）", sample: "2026年11月14日" },
  { value: "wareki", label: "令和（令和8年11月14日）", sample: "令和8年11月14日" },
  { value: "y", label: "年だけ（西暦・2026）", sample: "2026" },
  { value: "m", label: "月だけ（11）", sample: "11" },
  { value: "d", label: "日だけ（14）", sample: "14" },
];
const DATE_FMTS = new Set<string>(REF_FORM_DATE_FMTS.map((f) => f.value));
export const isRefFormPlanDate = (k: RefFormFieldKind): k is `plan_${PlanDateKey}` => k.startsWith("plan_");

// 日付（YYYY-MM-DD）を書き方どおりに。空・不正は空欄
export function refFormDateText(date: string | null | undefined, fmt: RefFormDateFmt = "seireki"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!m) return "";
  const [y, mo, d] = [m[1], String(Number(m[2])), String(Number(m[3]))];
  switch (fmt) {
    case "wareki":
      return warekiDate(date ?? "");
    case "y":
      return y;
    case "m":
      return mo;
    case "d":
      return d;
    default:
      return `${y}年${mo}月${d}日`;
  }
}

// 記入位置の画面で見せる見本
export function refFormSampleOf(item: Pick<RefFormItem, "kind" | "text" | "fmt">): string {
  if (isRefFormPlanDate(item.kind)) return REF_FORM_DATE_FMTS.find((f) => f.value === (item.fmt ?? "seireki"))?.sample ?? "";
  const f = REF_FORM_FIELDS.find((x) => x.kind === item.kind);
  // 見本が空の項目は、置いた所が点にならないよう項目の名前を出す
  return f?.sample || f?.label || "";
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
      fmt: typeof o.fmt === "string" && DATE_FMTS.has(o.fmt) ? (o.fmt as RefFormDateFmt) : undefined,
      cell: typeof o.cell === "number" && o.cell > 0 && o.cell < 100 ? o.cell : undefined,
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
  // 書類作成日（申請準備の「支援計画書の日付」の書類作成日。YYYY-MM-DD・無ければ空）
  docDate?: string;
  // 申請準備の「支援計画書の日付」（キー → YYYY-MM-DD）。無ければ空欄
  planDates?: Record<string, string>;
  // 賃金（外国人詳細の「賃金（1-6号別紙）」の現在の記録）。無ければ空欄
  wage?: { kind: string; amount: number } | null;
  // 1-6号別紙（賃金の支払）の値（refFormWage6Values）。無ければ空欄
  wage6?: Record<string, string>;
  // 1-17号 支援計画書に記載する項目の値（prep117Values）。無ければ空欄
  p117?: Record<string, string>;
  // 証明書類の請求で使う値（個人番号・税務署名・代理人）
  myNumber?: string;
  taxOfficeName?: string;
  agent?: { name: string; address: string };
}

const postal = (v: string) => {
  const d = (v ?? "").replace(/[^\d]/g, "");
  return d.length === 7 ? `〒${d.slice(0, 3)}-${d.slice(3)}` : "";
};
const ymd = (v: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : null;
};

export function refFormValue(item: Pick<RefFormItem, "kind" | "text" | "fmt">, data: RefFormData): string {
  const p = data.person;
  const b = ymd(p.birth);
  const t = ymd(data.today);
  const dd = ymd(data.docDate ?? null);
  const wageIs = (k: string) => (data.wage && data.wage.kind === k ? data.wage.amount.toLocaleString("ja-JP") : "");
  switch (item.kind) {
    case "wage_amount":
      return data.wage ? data.wage.amount.toLocaleString("ja-JP") : "";
    case "wage_monthly":
      return wageIs("月給");
    case "wage_daily":
      return wageIs("日給");
    case "wage_hourly":
      return wageIs("時給");
  }
  if (item.kind.startsWith("w6_")) return data.wage6?.[item.kind.slice(3)] ?? "";
  if (item.kind.startsWith("p117_")) return data.p117?.[item.kind.slice(5)] ?? "";
  switch (item.kind) {
    case "my_number": {
      const digits = (data.myNumber ?? "").replace(/[^0-9]/g, "");
      return digits.length === 12 ? digits : "";
    }
    case "tax_office":
      return (data.taxOfficeName ?? "").trim().replace(/税務署$/, "");
    case "tax_office_full":
      return (data.taxOfficeName ?? "").trim();
    case "agent_name":
      return data.agent?.name ?? "";
    case "agent_address":
      return data.agent?.address ?? "";
  }
  if (item.kind === "docall_y" || item.kind === "docall_m" || item.kind === "docall_d") {
    return refFormDateText(data.planDates?.docAll, item.kind === "docall_y" ? "y" : item.kind === "docall_m" ? "m" : "d");
  }
  if (isRefFormPlanDate(item.kind)) {
    const key = item.kind.slice("plan_".length);
    const v = data.planDates?.[key] ?? (key === "doc" ? data.docDate : "");
    return refFormDateText(v, item.fmt);
  }
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
    case "doc_date":
      return dd ? warekiDate(data.docDate ?? "") : "";
    case "doc_date_seireki":
      return dd ? `${dd.y}年${dd.m}月${dd.d}日` : "";
    case "doc_y":
      return dd?.y ?? "";
    case "doc_m":
      return dd?.m ?? "";
    case "doc_d":
      return dd?.d ?? "";
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
    case "text": {
      // 文字を入れていない（置いたときの見本「（文字）」のまま）なら何も書かない
      const v = (item.text ?? "").trim();
      return v === REF_FORM_TEXT_PLACEHOLDER ? "" : v;
    }
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
  docDate: "2026-11-14",
  wage: { kind: "月給", amount: 220000 },
  wage6: Object.fromEntries(W6_FIELDS.map((f) => [f.key, f.sample])),
  p117: Object.fromEntries(P117_FIELDS.map((f) => [f.key, f.sample])),
  myNumber: "123456789012",
  taxOfficeName: "八代税務署",
  agent: { name: "野口明菜", address: "熊本県熊本市東区小山3-8-87カームリーハウスB201" },
  planDates: { docAll: "2026-11-15", doc: "2026-11-14", cond: "2026-11-10", con: "2026-11-12", es: "2026-12-01", apply: "2026-11-20" },
};

// 賃金の種類で塗る□（■）
export const REF_FORM_MARK_KIND: Partial<Record<RefFormFieldKind, string>> = {
  mark_monthly: "月給",
  mark_daily: "日給",
  mark_hourly: "時給",
};
export const isRefFormMark = (k: RefFormFieldKind) => k in REF_FORM_MARK_KIND;

export const isRefFormCircle = (k: RefFormFieldKind) =>
  k === "circle" || k === "circle_male" || k === "circle_female";

// 作るときに外せる○の一覧（見分け用の名前つき）。名前が無いときは「1ページ目の○（2個目）」
export function refFormCircles(layout: RefFormItem[]): { id: string; label: string }[] {
  const circles = layout.filter((i) => isRefFormCircle(i.kind));
  const perPage = new Map<number, number>();
  return circles
    .slice()
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
    .map((c) => {
      const n = (perPage.get(c.page) ?? 0) + 1;
      perPage.set(c.page, n);
      const name = (c.text ?? "").trim();
      const cond = c.kind === "circle_male" ? "（男のときだけ）" : c.kind === "circle_female" ? "（女のときだけ）" : "";
      return { id: c.id, label: `${name || `${c.page + 1}ページ目の○（${n}個目）`}${cond}` };
    });
}

// 作るときに外す○（URL の off=テンプレートID:項目ID,...）から、そのひな形の分の項目IDを取り出す
export function refFormOffIds(off: string | null, templateId: string): Set<string> {
  const out = new Set<string>();
  for (const part of (off ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i > 0 && part.slice(0, i) === templateId && part.slice(i + 1)) out.add(part.slice(i + 1));
  }
  return out;
}

// ---- 作成画面で直した分（0230） ----
// 作成画面で、この人の分として入れた文字・動かした位置・外した項目
export interface RefFormEdits {
  texts: Record<string, string>; // 項目ID → 文字（自由な文字）
  moves: Record<string, { x: number; y: number }>; // 項目ID → 位置（pt）
  off: string[]; // 書かない項目ID
}
export const EMPTY_REF_FORM_EDITS: RefFormEdits = { texts: {}, moves: {}, off: [] };

// 保存値（jsonb）を読む。形が違うものは捨てる
export function normalizeRefFormEdits(v: { texts?: unknown; moves?: unknown; off?: unknown } | null | undefined): RefFormEdits {
  const texts: Record<string, string> = {};
  if (v?.texts && typeof v.texts === "object") {
    for (const [k, t] of Object.entries(v.texts as Record<string, unknown>)) if (typeof t === "string") texts[k] = t;
  }
  const moves: Record<string, { x: number; y: number }> = {};
  if (v?.moves && typeof v.moves === "object") {
    for (const [k, m] of Object.entries(v.moves as Record<string, unknown>)) {
      const o = m as { x?: unknown; y?: unknown } | null;
      if (o && typeof o.x === "number" && typeof o.y === "number" && Number.isFinite(o.x) && Number.isFinite(o.y)) {
        moves[k] = { x: o.x, y: o.y };
      }
    }
  }
  const off = Array.isArray(v?.off) ? [...new Set((v.off as unknown[]).filter((x): x is string => typeof x === "string"))] : [];
  return { texts, moves, off };
}

// 作成画面で入れられる項目（自由な文字）か
export const isRefFormEditableText = (k: RefFormFieldKind) => k === "text";

// 自由な文字の最初の値: この人の一時保存 → 所属機関の共通 → 記入位置で決めた文字（見本の「（文字）」は空）
export function refFormInitialText(
  item: Pick<RefFormItem, "id" | "text">,
  draftTexts: Record<string, string>,
  orgTexts: Record<string, string>,
): string {
  if (item.id in draftTexts) return draftTexts[item.id];
  if (item.id in orgTexts) return orgTexts[item.id];
  const t = (item.text ?? "").trim();
  return t === REF_FORM_TEXT_PLACEHOLDER ? "" : t;
}

// 記入位置に、作成画面で直した分（文字・位置・外した項目）を重ねる。
// orgTexts は所属機関の共通の文字（この人の分で入れていない所に使う）
export function applyRefFormEdits(
  layout: RefFormItem[],
  edits: RefFormEdits,
  orgTexts: Record<string, string> = {},
): RefFormItem[] {
  const off = new Set(edits.off);
  return layout
    .filter((i) => !off.has(i.id))
    .map((i) => {
      const m = edits.moves[i.id];
      const moved = m ? { ...i, x: m.x, y: m.y } : i;
      return isRefFormEditableText(i.kind) ? { ...moved, text: refFormInitialText(i, edits.texts, orgTexts) } : moved;
    });
}

// 個人番号の1マスの幅（pt）。入れていなければ文字の大きさの1.5倍
export function refFormCellWidth(item: Pick<RefFormItem, "cell" | "size">): number {
  return item.cell ?? Math.round(item.size * 1.5 * 10) / 10;
}

// 性別で出し分ける○を書き込むか（性別が分からないときはどちらも書かない）
export function refFormCircleShown(kind: RefFormFieldKind, gender: string): boolean {
  if (kind !== "circle_male" && kind !== "circle_female") return true;
  const g = (gender ?? "").trim();
  const sex = g.includes("女") || /^f/i.test(g) ? "female" : g.includes("男") || /^m/i.test(g) ? "male" : "";
  return kind === "circle_male" ? sex === "male" : sex === "female";
}

function drawItem(page: PDFPage, font: PDFFont, item: RefFormItem, data: RefFormData) {
  const black = rgb(0, 0, 0);
  const { height } = page.getSize();
  // ✓（いつも書く／1-17号の住居は選んだ欄だけ）
  const isP117Check = item.kind.startsWith("p117_check_");
  if (item.kind === "check" || isP117Check) {
    if (isP117Check && !refFormValue(item, data)) return;
    const s = item.size;
    const x = item.x;
    const top = height - item.y;
    page.drawLine({ start: { x, y: top - s * 0.55 }, end: { x: x + s * 0.35, y: top - s }, thickness: Math.max(1, s / 8), color: black });
    page.drawLine({ start: { x: x + s * 0.35, y: top - s }, end: { x: x + s, y: top }, thickness: Math.max(1, s / 8), color: black });
    return;
  }
  if (isRefFormMark(item.kind)) {
    // 本人の賃金の種類のときだけ、□の大きさの■を塗る
    if (data.wage?.kind !== REF_FORM_MARK_KIND[item.kind]) return;
    page.drawRectangle({ x: item.x, y: height - item.y - item.size, width: item.size, height: item.size, color: black });
    return;
  }
  if (item.kind === "circle" || item.kind === "circle_male" || item.kind === "circle_female") {
    if (!refFormCircleShown(item.kind, data.person.gender)) return;
    const r = item.size / 2;
    page.drawEllipse({ x: item.x + r, y: height - item.y - r, xScale: r, yScale: r, borderColor: black, borderWidth: Math.max(0.8, item.size / 18) });
    return;
  }
  // 個人番号: 置いた位置から右へ、1マスに1文字ずつ（マスの真ん中に）書く
  if (item.kind === "my_number") {
    const digits = refFormValue(item, data);
    if (!digits) return;
    const cell = refFormCellWidth(item);
    const ascent = font.heightAtSize(item.size, { descender: false });
    [...digits].forEach((ch, i) => {
      const w = font.widthOfTextAtSize(ch, item.size);
      page.drawText(ch, { x: item.x + i * cell + (cell - w) / 2, y: height - item.y - ascent, size: item.size, font, color: black });
    });
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
  // 作るときに外す項目（○）の id
  offIds?: ReadonlySet<string>,
  // 書き込んだあとに、同じフォントでページを足す（1-17号のうしろの名簿など）
  after?: (doc: PDFDocument, font: PDFFont) => void,
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const pages = doc.getPages();
  for (const item of layout) {
    if (offIds?.has(item.id)) continue;
    const page = pages[item.page];
    if (page) drawItem(page, font, item, data);
  }
  after?.(doc, font);
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

