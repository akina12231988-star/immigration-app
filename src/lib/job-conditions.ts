// 所属機関 ＞ 求人票に記載する内容（雇用条件書の順番）の計算。
// 始業・終業・休憩から1日の所定労働時間、年間所定労働日数から年間休日日数を出す。

import type { OrganizationIntake, OrgWorkplace } from "@/types/db";

// "8:00" / "08:00" → 分。読めなければ null
export function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 1日の所定労働時間（分）= 終業 − 始業 − 休憩。終業が始業より前なら日をまたぐ勤務とみなす
export function dailyWorkMinutes(start: string, end: string, breakMinutes: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return null;
  const span = e > s ? e - s : e + 24 * 60 - s;
  const brk = Number(breakMinutes.replace(/[^0-9]/g, "")) || 0;
  const work = span - brk;
  return work > 0 ? work : null;
}

// 分 → 「8時間」「7時間30分」
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 1日の所定労働時間の表記（入力が足りなければ空）
export function dailyWorkText(start: string, end: string, breakMinutes: string): string {
  const w = dailyWorkMinutes(start, end, breakMinutes);
  return w == null ? "" : minutesText(w);
}

// 分 → 求人票の「1日の所定労働時間」に入れる小数の時間（例: 450 → "7.5"）
export function minutesToHoursDecimal(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

// 年間合計休日日数 = 365 − 年間所定労働日数
export function annualHolidays(daysYear: string): number | null {
  const n = Number(daysYear.replace(/[^0-9]/g, ""));
  if (!daysYear.trim() || !Number.isFinite(n) || n <= 0 || n > 365) return null;
  return 365 - n;
}

// 事業所1件の表記（例: 本社（長崎県雲仙市…／0957-00-0000））
export function workplaceText(w: OrgWorkplace): string {
  const detail = [w.address.trim(), w.contact.trim()].filter(Boolean).join("／");
  const name = w.name.trim();
  if (!name && !detail) return "";
  return detail ? `${name || "事業所"}（${detail}）` : name;
}

// 求人票の「勤務地の変更の可能性」の表記
export function workplaceChangeText(kind: string, changes: OrgWorkplace[]): string {
  if (kind === "無") return "変更なし";
  if (kind !== "有") return "";
  const list = changes.map(workplaceText).filter(Boolean);
  return list.length > 0 ? `変更あり: ${list.join("、")}` : "変更あり";
}

// 社会保険の加入状況・労働保険の適用状況の選択肢（複数選択。「その他」は内容を文字で入れる）
export const JOB_INSURANCE_OPTIONS = [
  "厚生年金",
  "健康保険",
  "雇用保険",
  "労災保険",
  "国民年金",
  "国民健康保険",
  "その他",
] as const;

// 求人票の加入保険の名前（厚生年金 → 厚生年金保険）
export function postingInsuranceName(name: string): string {
  return name === "厚生年金" ? "厚生年金保険" : name;
}

// 就業の場所の1行目を「作業する住所・TEL/FAX」に合わせる（自動転記）。
// 1行目が空か、前の作業する住所・TEL/FAX のままなら新しい値に置き換える。
// 手で別の内容に書き換えた行は上書きしない。事業所名が空なら会社名を入れる
export function followWorkSite(
  workplaces: OrgWorkplace[],
  prev: { address: string; contact: string },
  next: { address: string; contact: string },
  orgName: string,
): OrgWorkplace[] {
  const rows = workplaces.length > 0 ? [...workplaces] : [{ name: "", address: "", contact: "" }];
  const first = rows[0];
  const follows = (cur: string, before: string) => cur.trim() === "" || cur.trim() === before.trim();
  const address = follows(first.address, prev.address) ? next.address : first.address;
  const contact = follows(first.contact, prev.contact) ? next.contact : first.contact;
  const name = first.name.trim() || !(address.trim() || contact.trim()) ? first.name : orgName.trim();
  rows[0] = { name, address, contact };
  return rows;
}

// 連絡先から電話番号だけを取り出す（「TEL 0957-00-0000 / FAX 0957-00-0001」→「0957-00-0000」）。
// FAX 番号は就業場所の一覧表に載せない
export function phoneOnly(contact: string): string {
  const parts = contact
    .split(/[\/／、,]/)
    .map((p) => p.trim())
    .filter((p) => p && !/^FAX/i.test(p));
  return parts
    .map((p) => p.replace(/^(TEL|電話)[\s:：]*/i, "").trim())
    .filter(Boolean)
    .join(" / ");
}

// 住所の比べ方（郵便番号・空白を除き、全角の数字・ハイフンを半角にそろえる）
function addressKey(address: string): string {
  return address
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－ー―‐−]/g, "-")
    .replace(/〒?\s*\d{3}-?\d{4}/, "")
    .replace(/\s|　/g, "");
}

// 就業場所の一覧表（A4）の行。就業の場所 → 変更先の事業所（変更の可能性が「有」のとき）の順。
// 就業の場所の行（作業する住所から自動で入った行など）と同じ住所が変更先にもあるときは、
// 変更先に入力した行（事業所名つき）だけを出して二重にしない。空の行は除く
export function workplaceListRows(intake: {
  job_workplaces?: OrgWorkplace[];
  job_workplace_change?: string;
  job_workplace_changes?: OrgWorkplace[];
}): { name: string; address: string; phone: string }[] {
  const filled = (w: OrgWorkplace) => !!(w.name.trim() || w.address.trim() || w.contact.trim());
  const changes = intake.job_workplace_change === "有" ? (intake.job_workplace_changes ?? []).filter(filled) : [];
  const changeKeys = new Set(changes.map((w) => addressKey(w.address)).filter(Boolean));
  const base = (intake.job_workplaces ?? [])
    .filter(filled)
    .filter((w) => !changeKeys.has(addressKey(w.address)));
  return [...base, ...changes].map((w) => ({ name: w.name.trim(), address: w.address.trim(), phone: phoneOnly(w.contact) }));
}

// 一覧表を印刷できるか（変更の可能性が「有」で、就業場所が2か所以上）
export function canPrintWorkplaceList(intake: Parameters<typeof workplaceListRows>[0]): boolean {
  return intake.job_workplace_change === "有" && workplaceListRows(intake).length >= 2;
}

// ---- 雇用条件書に記載する内容の表示（外国人詳細の賃金の欄などで、所属機関の登録内容を読むだけ） ----

export interface JobConditionSection {
  title: string; // 例: 「1. 就業の場所」
  lines: string[]; // 表示する行（未登録は「未登録」）
}

type JobIntake = Pick<
  OrganizationIntake,
  | "job_workplaces"
  | "job_workplace_change"
  | "job_workplace_changes"
  | "job_work_start"
  | "job_work_end"
  | "job_break_minutes"
  | "job_shift"
  | "job_shifts"
  | "flex_hours_kind"
  | "posting_weekly_hours"
  | "posting_monthly_hours"
  | "posting_annual_hours"
  | "job_days_week"
  | "job_days_month"
  | "job_days_year"
  | "job_overtime"
  | "job_holiday_weekly"
  | "job_holiday_other"
  | "posting_pay_closing"
  | "posting_pay_day"
  | "pay_method"
  | "job_wage_deduction"
  | "job_raise"
  | "job_raise_note"
  | "job_bonus"
  | "job_bonus_note"
  | "job_retirement_pay"
  | "job_retirement_pay_note"
  | "job_resign_notice_days"
  | "job_insurances"
  | "job_insurance_other"
  | "job_rules_where"
>;

const orNone = (v: string) => v.trim() || "未登録";
const withNote = (v: string, note: string) => (v === "有" && note.trim() ? `有（${note.trim()}）` : orNone(v));

// 所属機関 ＞ 求人票に記載する内容（雇用条件書の順番）を、見出しごとの行にする
export function jobConditionSections(intake: JobIntake): JobConditionSection[] {
  const workplaces = (intake.job_workplaces ?? []).map(workplaceText).filter(Boolean);
  const time = (start: string, end: string, brk: string) => {
    if (!start.trim() && !end.trim()) return "";
    const daily = dailyWorkText(start, end, brk);
    return `${start || "?"}〜${end || "?"}（休憩${brk.trim() || "?"}分${daily ? `・1日${daily}` : ""}）`;
  };
  const holidays = annualHolidays(intake.job_days_year ?? "");
  const insurances = (intake.job_insurances ?? []).map((o) =>
    o === "その他" && intake.job_insurance_other.trim() ? `その他（${intake.job_insurance_other.trim()}）` : o,
  );
  return [
    {
      title: "1. 就業の場所",
      lines: [
        ...(workplaces.length > 0 ? workplaces : ["未登録"]),
        `変更の可能性：${workplaceChangeText(intake.job_workplace_change, intake.job_workplace_changes ?? []) || "未登録"}`,
      ],
    },
    {
      title: "2. 始業・終業の時刻、休憩時間",
      lines: [
        time(intake.job_work_start, intake.job_work_end, intake.job_break_minutes) || "未登録",
        ...(intake.job_shift
          ? (intake.job_shifts ?? []).map((s, i) => `交代制${i + 1}：${time(s.start, s.end, s.break_minutes) || "未登録"}`)
          : []),
        `変形労働時間制：${orNone(intake.flex_hours_kind)}`,
      ],
    },
    {
      title: "3. 所定労働時間数",
      lines: [
        `週平均 ${orNone(intake.posting_weekly_hours)}　月平均 ${orNone(intake.posting_monthly_hours)}　年間 ${orNone(intake.posting_annual_hours)}`,
      ],
    },
    {
      title: "4. 所定労働日数",
      lines: [`週 ${orNone(intake.job_days_week)}　月 ${orNone(intake.job_days_month)}　年 ${orNone(intake.job_days_year)}`],
    },
    { title: "5. 所定時間外労働", lines: [orNone(intake.job_overtime)] },
    {
      title: "6. 休日",
      lines: [
        `定例日：${intake.job_holiday_weekly.trim() ? `毎週${intake.job_holiday_weekly.trim()}` : "未登録"}`,
        ...(intake.job_holiday_other.trim() ? [`その他：${intake.job_holiday_other.trim()}`] : []),
        ...(holidays != null ? [`年間合計休日日数：${holidays}日`] : []),
      ],
    },
    { title: "7. 年次有給休暇", lines: ["6ヶ月継続勤務した場合 → 10日付与", "6ヶ月未満の年次有給休暇 → 無し"] },
    {
      title: "8. 賃金",
      lines: [
        `締切日：${orNone(intake.posting_pay_closing)}　支払日：${orNone(intake.posting_pay_day)}　支払方法：${orNone(intake.pay_method)}`,
        `労使協定に基づく賃金支払時の控除：${orNone(intake.job_wage_deduction)}`,
        `昇給：${withNote(intake.job_raise, intake.job_raise_note)}`,
        `賞与：${withNote(intake.job_bonus, intake.job_bonus_note)}`,
        `退職金：${withNote(intake.job_retirement_pay, intake.job_retirement_pay_note)}`,
        "休業手当：有（平均賃金の60%）",
      ],
    },
    {
      title: "9. 退職",
      lines: [
        intake.job_resign_notice_days.trim()
          ? `自己都合の場合：${intake.job_resign_notice_days.trim()}前に社長・工場長等に届けること`
          : "自己都合の場合：未登録",
      ],
    },
    { title: "10. 社会保険の加入状況・労働保険の適用状況", lines: [insurances.length > 0 ? insurances.join("・") : "未登録"] },
    { title: "11. 就業規則を確認できる方法や場所", lines: [orNone(intake.job_rules_where)] },
  ];
}
