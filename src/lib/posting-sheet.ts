// 求人票（特定技能1号）の内容の既定値・読み込み・貼り付け用テキスト。
//
// 会社に書いてもらう求人票をそのまま求人詳細に入力できるようにするためのもの。
// 保存先は job_postings.sheet（jsonb・0090_job_posting_sheet.sql）。

import type { JobPosting, PostingAllowance, PostingSheet } from "@/types/recruiting";
import { formatWage } from "@/types/recruiting";

export function emptyPostingAllowance(): PostingAllowance {
  return { name: "", amount: "", method: "" };
}

export function emptyPostingSheet(): PostingSheet {
  return {
    filled_on: "",
    field_name: "",
    work_location_change: "変更なし",
    job_description: "",
    contract_term_kind: "期間の定めあり",
    contract_term: "",
    contract_renewal: "",
    contract_renewal_kind: "",
    contract_renewal_criteria: [],
    contract_renewal_other: "",
    work_start: "",
    work_end: "",
    daily_hours: "",
    flexible_hours: "",
    break_minutes: "",
    overtime: "",
    fixed_overtime: "",
    holidays: [],
    holiday_note: "",
    allowances: [],
    deduction_items: [],
    income_tax: "",
    social_insurance: "適用",
    employment_insurance: "適用",
    housing_cost: "",
    housing_kind: "",
    housing_lodging_id: "",
    housing_note: "",
    utility_cost: "",
    utility_kind: "",
    communication_cost: "",
    raise: "",
    raise_note: "",
    bonus: "",
    bonus_note: "",
    pay_closing_day: "",
    pay_day: "",
    pay_method: "口座振込",
    insurances: [],
    insurance_other: "",
    smoking: "",
    smoking_note: "",
    experience: "",
    requirements: "",
    other_requirements: "",
  };
}

// 時刻入力を「8:00」の形にそろえる。
// 「800」「0830」「8」「８：００」のような入力も自動で変換する。時刻と読めなければそのまま返す
export function normalizeTimeInput(v: string): string {
  const half = v
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":");
  if (!half) return "";
  let hour: number;
  let minute: number;
  const colon = half.match(/^(\d{1,2}):(\d{1,2})$/);
  const digits = half.match(/^(\d{1,4})$/);
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (digits) {
    const d = digits[1];
    if (d.length <= 2) {
      // 「8」「17」→ 8:00・17:00
      hour = Number(d);
      minute = 0;
    } else {
      // 「800」「1730」→ 後ろ2桁を分にする
      hour = Number(d.slice(0, -2));
      minute = Number(d.slice(-2));
    }
  } else {
    return v;
  }
  // 深夜勤務の「25:00」なども許容する
  if (hour > 29 || minute > 59) return v;
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

// 「8:00」を0時からの分に直す。読めなければ null
function timeToMinutes(v: string): number | null {
  const m = normalizeTimeInput(v).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// 始業・終業・休憩（分）から1日の所定労働時間を出す（例: 「7時間30分」）。
// 計算できないときは空を返す。終業が始業より前なら夜勤（日またぎ）として扱う
export function dailyWorkHours(start: string, end: string, breakMinutes: string): string {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || s === e) return "";
  const span = (e > s ? e - s : e + 24 * 60 - s) - (Number(breakMinutes) || 0);
  if (span <= 0) return "";
  const h = Math.floor(span / 60);
  const m = span % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function strList(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : fallback;
}

// 保存された jsonb（項目が欠けていることがある）を、欠けを既定値で埋めた形にする
export function normalizePostingSheet(raw: unknown): PostingSheet {
  const base = emptyPostingSheet();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const allowances = Array.isArray(r.allowances)
    ? (r.allowances as Record<string, unknown>[]).map((a) => ({
        name: str(a?.name),
        amount: str(a?.amount),
        method: str(a?.method),
      }))
    : base.allowances;

  const out = { ...base };
  for (const key of Object.keys(base) as (keyof PostingSheet)[]) {
    const v = r[key];
    if (v === undefined) continue;
    if (key === "allowances") continue;
    if (
      key === "holidays" ||
      key === "insurances" ||
      key === "deduction_items" ||
      key === "contract_renewal_criteria"
    ) {
      out[key] = strList(v, base[key]);
      continue;
    }
    (out as Record<string, unknown>)[key] = str(v, base[key] as string);
  }
  out.allowances = allowances;
  return out;
}

// 求人票の内容が何か入っているか（詳細画面に欄を出すかの判定に使う）
export function hasPostingSheet(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.keys(raw as Record<string, unknown>).length > 0;
}

// 休日の表示（例: 「土・日・祝祭日 ／ 隔週土曜出勤」）
export function holidayText(sheet: PostingSheet): string {
  const days = sheet.holidays.join("・");
  if (days && sheet.holiday_note) return `${days} ／ ${sheet.holiday_note}`;
  return days || sheet.holiday_note;
}

// 勤務時間の表示（例: 「8:00〜17:00（1日の所定労働時間 8時間）」）
export function workHoursText(sheet: PostingSheet): string {
  const span = sheet.work_start || sheet.work_end ? `${sheet.work_start}〜${sheet.work_end}` : "";
  const daily = sheet.daily_hours ? `（1日の所定労働時間 ${sheet.daily_hours}）` : "";
  return `${span}${daily}`;
}

// ---- 契約期間・契約の更新 ----

// 雇用契約期間の選択肢（期間の定めありの場合）
export const CONTRACT_TERMS = ["1年", "2年", "3年"] as const;

// 契約の更新の有無（雇用条件書「2. 契約の更新の有無」の3つ）
export const CONTRACT_RENEWAL_AUTO = "自動的に更新する";
export const CONTRACT_RENEWAL_MAYBE = "更新する場合があり得る";
export const CONTRACT_RENEWAL_NONE = "契約の更新はしない";
export const CONTRACT_RENEWAL_KINDS = [
  CONTRACT_RENEWAL_AUTO,
  CONTRACT_RENEWAL_MAYBE,
  CONTRACT_RENEWAL_NONE,
] as const;

// 「更新する場合があり得る」としたときの更新の判断基準（雇用条件書の※の6つ。
// 「その他」は自由入力なのでここには入れない）
export const CONTRACT_RENEWAL_CRITERIA = [
  "契約期間満了時の業務量",
  "労働者の勤務成績、態度",
  "労働者の業務を遂行する能力",
  "会社の経営状況",
  "従事している業務の進捗状況",
] as const;

// 判断基準を選べるのは「更新する場合があり得る」のときだけ。
// 「自動的に更新する」は自動更新のみで、基準は要らない
export function canPickRenewalCriteria(kind: string): boolean {
  return kind === CONTRACT_RENEWAL_MAYBE;
}

// 更新の判断基準の表示（選んだもの＋その他）
export function renewalCriteriaText(sheet: PostingSheet): string {
  const list = [...sheet.contract_renewal_criteria];
  if (sheet.contract_renewal_other) list.push(`その他（${sheet.contract_renewal_other}）`);
  return list.join("・");
}

// 契約の更新の表示（求人票の「契約の更新　無／有：…」の欄に入る文字）。
// 更新の有無を選んでいない古いデータは、保存されている自由入力をそのまま使う
export function contractRenewalText(sheet: PostingSheet): string {
  const kind = sheet.contract_renewal_kind;
  if (!kind) return sheet.contract_renewal;
  if (kind === CONTRACT_RENEWAL_NONE) return "無";
  if (!canPickRenewalCriteria(kind)) return `有：${kind}`;
  const criteria = renewalCriteriaText(sheet);
  return criteria ? `有：${kind}（${criteria}）` : `有：${kind}`;
}

// 契約の更新が「有」か（求人票のチェック欄の表示に使う）
export function isContractRenewalYes(sheet: PostingSheet): boolean {
  const text = contractRenewalText(sheet);
  return text.startsWith("有");
}

// 契約期間の表示
export function contractText(sheet: PostingSheet): string {
  const kind = sheet.contract_term_kind;
  const term = sheet.contract_term ? `：${sheet.contract_term}` : "";
  const renewalText = contractRenewalText(sheet);
  const renewal = renewalText ? ` ／ 契約の更新：${renewalText}` : "";
  return `${kind}${term}${renewal}`;
}

// 控除項目の表示（例: 「水道光熱費・社宅（居住費）・雇用保険料」）
export function deductionItemsText(sheet: PostingSheet): string {
  return sheet.deduction_items.join("・");
}

// 加入保険の表示
export function insurancesText(sheet: PostingSheet): string {
  const list = [...sheet.insurances];
  if (sheet.insurance_other) list.push(sheet.insurance_other);
  return list.join("・");
}

// 受動喫煙防止措置の表示
export function smokingText(sheet: PostingSheet): string {
  if (sheet.smoking === "その他") return sheet.smoking_note || "その他";
  return sheet.smoking_note ? `${sheet.smoking}（${sheet.smoking_note}）` : sheet.smoking;
}

// 金額の欄の表示。数字なら「◯円」、「なし」「無し」などの言葉ならそのまま出す
function yenOrText(v: string, prefix = ""): string {
  if (!v) return "";
  return /^\d+$/.test(v) ? `${prefix}${v}円` : v;
}

// 求人票の内容を、そのまま貼り付けたり読み合わせたりできるテキストにする
export function postingSheetText(
  posting: Pick<JobPosting, "job_type" | "openings" | "work_location" | "wage_kind" | "wage_amount" | "contact">,
  sheet: PostingSheet,
  orgName?: string,
): string {
  const line = (label: string, value: string) => (value ? `${label}：${value}` : "");
  const lines = [
    "【求人票（特定技能1号）】",
    line("求人者名（会社名）", orgName ?? ""),
    line("分野名", sheet.field_name),
    line("記入日", sheet.filled_on),
    line("連絡先", posting.contact),
    "",
    "■ 求人情報詳細",
    line("職種", posting.job_type),
    line("採用人数", posting.openings ? `${posting.openings}名` : ""),
    line("勤務地（雇入れ直後）", posting.work_location),
    line("勤務地の変更の可能性", sheet.work_location_change),
    line("仕事内容", sheet.job_description),
    line("契約期間", contractText(sheet)),
    line("勤務時間", workHoursText(sheet)),
    line("変形労働制", sheet.flexible_hours),
    line("休憩", sheet.break_minutes ? `${sheet.break_minutes}分` : ""),
    line("残業", sheet.overtime),
    line("固定残業代", sheet.fixed_overtime ? `月額${sheet.fixed_overtime}円` : ""),
    line("休日", holidayText(sheet)),
    "",
    "■ 給与",
    line("基本給", formatWage(posting.wage_kind, posting.wage_amount)),
    ...sheet.allowances
      .filter((a) => a.name || a.amount || a.method)
      .map(
        (a) =>
          `手当：${a.name}${a.amount ? ` ${a.amount}円` : ""}${a.method ? `／計算方法：${a.method}` : ""}`,
      ),
    line("控除項目", deductionItemsText(sheet)),
    line("源泉所得税（扶養0人として）", yenOrText(sheet.income_tax)),
    line("社会保険料", sheet.social_insurance),
    line("雇用保険料", sheet.employment_insurance),
    line(
      "居住費",
      [
        sheet.housing_cost ? `${sheet.housing_cost}円` : "",
        sheet.housing_kind,
        sheet.housing_note,
      ]
        .filter(Boolean)
        .join("／"),
    ),
    line(
      "水道光熱費",
      [sheet.utility_cost ? `約${sheet.utility_cost}円` : "", sheet.utility_kind]
        .filter(Boolean)
        .join("／"),
    ),
    line("通信費", yenOrText(sheet.communication_cost, "約")),
    line("昇給", [sheet.raise, sheet.raise_note].filter(Boolean).join("／")),
    line("賞与", [sheet.bonus, sheet.bonus_note].filter(Boolean).join("／")),
    line("給与の締切日", sheet.pay_closing_day),
    line("給与の支払日", sheet.pay_day),
    line("支払方法", sheet.pay_method),
    line("加入保険", insurancesText(sheet)),
    line("受動喫煙防止措置の状況", smokingText(sheet)),
    "",
    "■ 応募に必要とされる事項",
    line("経験の有無", sheet.experience),
    line("必要条件", sheet.requirements),
    line("その他", sheet.other_requirements),
  ];
  // 空の項目は出さず、見出し（■）の前だけ1行あける
  return lines.filter(Boolean).join("\n").replace(/\n(■ )/g, "\n\n$1");
}
