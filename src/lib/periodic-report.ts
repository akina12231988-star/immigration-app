// 定期報告書（参考様式第3-6号）の「4 労働条件等」の平均値の算出。
//
// 作成要領（定期届出作成要領）のルールをそのまま実装する:
//   ・（1）〜（6）は全員の平均。月の途中で受入れを開始・終了した月は含めずに算出
//     （人×月の加重平均。excluded の月は分母にも分子にも入れない）
//   ・（2）所定内実労働時間数 ＝ 実労働時間数 − 超過実労働時間数
//   ・（5）賞与などは「支払われた人数」で割る
//   ・（7）昇給率は {（当年度の基準額）−（前年度の基準額）} ÷ 前年度の基準額 × 100。
//     基準額 ＝（4）きまって支給する現金給与額 −（①超過労働給与〜④家族手当）。
//     昇給していなければ 0%、対象者（2年以上継続）がいなければ空欄
//   ・丸め: 金額・日数・時間は小数点第1位を四捨五入して整数、昇給率は第2位を四捨五入して第1位まで
//   ・その号での雇用が1か月未満（集計できる月が無い）なら（1）〜（6）は0、備考「1か月未満」

import type { OrgPayrollItemRow, PayrollItemCategory, PeriodicReportEntryRow } from "@/types/db";

// 丸め: 金額・日数・時間（整数）
export const round0 = (x: number): number => Math.round(x);
// 丸め: 昇給率（小数点第1位まで）
export const round1 = (x: number): number => Math.round(x * 10) / 10;

// 1か月分をカテゴリごとに合計したもの
export interface MonthTotals {
  ym: string;
  excluded: boolean;
  workDays: number | null; // （1）実労働日数
  regularHours: number | null; // （2）所定内実労働時間数（実労働時間 − 超過）
  overtimeHours: number | null; // （3）超過実労働時間数
  cashPay: number | null; // （4）きまって支給する現金給与額
  overtimePay: number; // ①うち超過労働給与額
  commute: number; // ②うち通勤手当
  attendance: number; // ③うち精皆勤手当
  family: number; // ④うち家族手当
  bonus: number; // （5）賞与・期末手当等（（4）には入れない）
  food: number; // （6）①食費
  housing: number; // （6）②居住費
  taxSocial: number; // （6）③税・社会保険料
  otherDeduction: number; // （6）④その他
}

// （4）に入るカテゴリ（賞与・控除・集計しないは入れない）
const CASH_PAY_CATEGORIES: PayrollItemCategory[] = [
  "基本給など",
  "超過労働給与",
  "通勤手当",
  "精皆勤手当",
  "家族手当",
];

// 入力1件（人×月）を、項目のカテゴリで3-6号の欄ごとに合計する
export function entryToMonthTotals(
  entry: Pick<PeriodicReportEntryRow, "ym" | "work_days" | "total_hours" | "overtime_hours" | "amounts" | "excluded">,
  itemsById: Record<string, Pick<OrgPayrollItemRow, "category">>,
): MonthTotals {
  const sums: Record<string, number> = {};
  let hasPay = false;
  for (const [itemId, raw] of Object.entries(entry.amounts ?? {})) {
    const category = itemsById[itemId]?.category;
    if (!category || category === "集計しない") continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    sums[category] = (sums[category] ?? 0) + v;
    if ((CASH_PAY_CATEGORIES as string[]).includes(category)) hasPay = true;
  }
  const cash = CASH_PAY_CATEGORIES.reduce((a, c) => a + (sums[c] ?? 0), 0);
  return {
    ym: entry.ym,
    excluded: entry.excluded,
    workDays: entry.work_days,
    regularHours:
      entry.total_hours == null ? null : entry.total_hours - (entry.overtime_hours ?? 0),
    overtimeHours: entry.overtime_hours,
    // 金額の入力がまったく無い月は「未入力」として平均に入れない（null）
    cashPay: hasPay ? cash : null,
    overtimePay: sums["超過労働給与"] ?? 0,
    commute: sums["通勤手当"] ?? 0,
    attendance: sums["精皆勤手当"] ?? 0,
    family: sums["家族手当"] ?? 0,
    bonus: sums["賞与など"] ?? 0,
    food: sums["控除 食費"] ?? 0,
    housing: sums["控除 居住費"] ?? 0,
    taxSocial: sums["控除 税・社会保険料"] ?? 0,
    otherDeduction: sums["控除 その他"] ?? 0,
  };
}

// 平均の対象になる月（除外月と、日数・時間・金額が何も入っていない月は除く）
export function countedMonths(months: MonthTotals[]): MonthTotals[] {
  return months.filter(
    (m) => !m.excluded && (m.workDays != null || m.regularHours != null || m.cashPay != null),
  );
}

interface WorkerMonths {
  months: MonthTotals[];
}

// 人×月の加重平均（除外月は分母にも分子にも入れない）。対象の値が無ければ 0
function avgPerMonth(workers: WorkerMonths[], pick: (m: MonthTotals) => number | null): number {
  let sum = 0;
  let count = 0;
  for (const w of workers) {
    for (const m of countedMonths(w.months)) {
      const v = pick(m);
      if (v == null) continue;
      sum += v;
      count += 1;
    }
  }
  return count === 0 ? 0 : round0(sum / count);
}

// （5）賞与など: 年間の支給総額 ÷ 支払われた人数（要領の記載例どおり）
export function bonusAverage(workers: WorkerMonths[]): number {
  let total = 0;
  let paid = 0;
  for (const w of workers) {
    const t = w.months.reduce((a, m) => a + (m.bonus ?? 0), 0);
    total += t;
    if (t > 0) paid += 1;
  }
  return paid === 0 ? 0 : round0(total / paid);
}

// 3-6号「4 労働条件等」の1号（または2号）の列
export interface Section36 {
  months: number; // 集計に使った人×月の数（画面の確認用）
  workDays: number;
  regularHours: number;
  overtimeHours: number;
  cashPay: number;
  overtimePay: number;
  commute: number;
  attendance: number;
  family: number;
  bonus: number;
  food: number;
  housing: number;
  taxSocial: number;
  otherDeduction: number;
  note: string; // 「1か月未満」など（空 = なし）
}

// 号ごとの（1）〜（6）。集計できる月が1つも無ければすべて0＋備考「1か月未満」
export function buildSection36(workers: WorkerMonths[]): Section36 {
  const monthCount = workers.reduce((a, w) => a + countedMonths(w.months).length, 0);
  if (workers.length > 0 && monthCount === 0) {
    return {
      months: 0,
      workDays: 0,
      regularHours: 0,
      overtimeHours: 0,
      cashPay: 0,
      overtimePay: 0,
      commute: 0,
      attendance: 0,
      family: 0,
      bonus: 0,
      food: 0,
      housing: 0,
      taxSocial: 0,
      otherDeduction: 0,
      note: "1か月未満",
    };
  }
  return {
    months: monthCount,
    workDays: avgPerMonth(workers, (m) => m.workDays),
    regularHours: avgPerMonth(workers, (m) => m.regularHours),
    overtimeHours: avgPerMonth(workers, (m) => m.overtimeHours),
    cashPay: avgPerMonth(workers, (m) => m.cashPay),
    overtimePay: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.overtimePay)),
    commute: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.commute)),
    attendance: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.attendance)),
    family: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.family)),
    bonus: bonusAverage(workers),
    food: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.food)),
    housing: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.housing)),
    taxSocial: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.taxSocial)),
    otherDeduction: avgPerMonth(workers, (m) => (m.cashPay == null ? null : m.otherDeduction)),
    note: "",
  };
}

// 昇給率の基準額（その年度の月額平均）。（4）−（①〜④）。集計できる月が無ければ null
export function raiseBase(months: MonthTotals[]): number | null {
  const counted = countedMonths(months).filter((m) => m.cashPay != null);
  if (counted.length === 0) return null;
  const sum = counted.reduce(
    (a, m) => a + (m.cashPay ?? 0) - m.overtimePay - m.commute - m.attendance - m.family,
    0,
  );
  return sum / counted.length; // 丸めずに昇給率の計算に使う
}

// （7）昇給率。対象者（2年以上継続）の基準額の合計で比べる。
// 昇給していなければ 0%、対象者がいない・前年度の額が無ければ null（空欄）
export function raiseRate(targets: { baseCurrent: number; basePrevious: number }[]): number | null {
  if (targets.length === 0) return null;
  let cur = 0;
  let prev = 0;
  for (const t of targets) {
    cur += t.baseCurrent;
    prev += t.basePrevious;
  }
  if (prev === 0) return null;
  return round1(((cur - prev) / prev) * 100);
}

// 2号へ移行した人の月割り（要領）: 変更許可を受けた月以降を2号の欄に記載し、
// 許可が月の途中なら翌月以降を記載する（移行前の月の状況は記載しない）。
// 許可日が月の初日ならその月、月の途中なら翌月の YYYY-MM を返す
export function gradeStartYm(permitDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(permitDate);
  if (!m) return "";
  if (m[3] === "01") return `${m[1]}-${m[2]}`;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return `${next.y}-${String(next.m).padStart(2, "0")}`;
}

// 年度の12か月（4月〜翌3月）の ym の一覧
export function fiscalYearMonths(fy: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const month = i < 9 ? i + 4 : i - 8;
    const year = i < 9 ? fy : fy + 1;
    out.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return out;
}
