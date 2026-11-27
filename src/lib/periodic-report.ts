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

import type { PayrollRequestRow } from "@/lib/payroll-request";
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

// 賃金台帳に時間外・休日・法定外・深夜などの時間数が別々にあるときのカテゴリ。
// 金額ではなく時間（時:分→小数）で入力し、（3）超過実労働時間数へ合算する
export const OVERTIME_TIME_CATEGORY: PayrollItemCategory = "超過時間数（時:分）";

// 入力1件（人×月）を、項目のカテゴリで3-6号の欄ごとに合計する
export function entryToMonthTotals(
  entry: Pick<PeriodicReportEntryRow, "ym" | "work_days" | "total_hours" | "overtime_hours" | "amounts" | "excluded">,
  itemsById: Record<string, Pick<OrgPayrollItemRow, "category">>,
): MonthTotals {
  const sums: Record<string, number> = {};
  let hasPay = false;
  // 時間数の項目（時間外・休日・深夜など）は金額とは別に合算して（3）に入れる
  let overtimeItemHours = 0;
  let hasOvertimeItem = false;
  for (const [itemId, raw] of Object.entries(entry.amounts ?? {})) {
    const category = itemsById[itemId]?.category;
    if (!category || category === "集計しない") continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    if (category === OVERTIME_TIME_CATEGORY) {
      overtimeItemHours += v;
      hasOvertimeItem = true;
      continue;
    }
    sums[category] = (sums[category] ?? 0) + v;
    if ((CASH_PAY_CATEGORIES as string[]).includes(category)) hasPay = true;
  }
  const cash = CASH_PAY_CATEGORIES.reduce((a, c) => a + (sums[c] ?? 0), 0);
  // （3）超過実労働時間数 = 直接入力した時間 + 時間数の項目の合算（どちらも無い月は未入力）
  const overtime =
    entry.overtime_hours == null && !hasOvertimeItem
      ? null
      : (entry.overtime_hours ?? 0) + overtimeItemHours;
  return {
    ym: entry.ym,
    excluded: entry.excluded,
    workDays: entry.work_days,
    regularHours: entry.total_hours == null ? null : entry.total_hours - (overtime ?? 0),
    overtimeHours: overtime,
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

// ---- 時間数の「時:分」の入力 ----
// 賃金台帳の時間数は「21:10」（21時間10分）の形が多いので、そのまま打てるようにする。
// 「2110」と打ったら最後の2桁を分として「21:10」にする（2桁以下は時間だけ）。
// 計算（平均）には 21 + 10/60 のような小数の時間で使う

// 入力の文字を小数の時間にする。空・数字なしは null。分が60以上なら繰り上げる
export function parseHoursInput(text: string): number | null {
  const t = (text ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .trim();
  if (!t) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const digits = t.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  // 小数（21.5 など）で打ったらそのまま時間として受ける
  if (digits.includes(".")) return Number(digits);
  if (digits.length <= 2) return Number(digits); // 「34」= 34時間
  const hours = Number(digits.slice(0, -2));
  const minutes = Number(digits.slice(-2));
  return hours + minutes / 60; // 分が60以上でも足し算なので自然に繰り上がる
}

// 小数の時間を「21:10」の形にする（分は四捨五入。null・空は ''）
export function hoursText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  const totalMinutes = Math.round(v * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes - h * 60;
  return `${h}:${String(m).padStart(2, "0")}`;
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

// ---- 入力画面と様式の出力で共通の集計 ----

// 入力1か月分（DBの行でも画面の下書きでもよい形）
export type ReportEntryLike = Pick<
  PeriodicReportEntryRow,
  "work_days" | "total_hours" | "overtime_hours" | "amounts" | "excluded"
>;

// その人の入力対象の月（依頼案内と同じ: 特定技能になる前・退職後の月は含めない）
export function reportMonthsFor(row: PayrollRequestRow, fy: number, year: number): string[] {
  return fiscalYearMonths(year).filter((ym) => {
    if (year === fy) return ym >= row.fromYm && ym <= row.toYm;
    return ym >= (row.prevFromYm || `${year}-04`) && ym <= (row.prevToYm || `${year + 1}-03`);
  });
}

export interface Report36Result {
  one: Section36;
  two: Section36;
  oneCount: number; // 1号として集計した人数
  twoCount: number; // 2号として集計した人数（期間中に移行した人を含む）
  raise1: number | null; // （7）昇給率。null = 対象者なし（空欄）
  raise2: number | null;
  raise1Targets: number; // 昇給率の計算に使えた人数（当年度・前年度の入力がそろった人）
  raise2Targets: number;
}

// 名簿（依頼案内と同じ自動抽出）と入力から、3-6号「4 労働条件等」をまとめて計算する。
// getEntry はその人・その月の入力（無ければ null）を返す
export function buildReport36(
  rows: PayrollRequestRow[],
  getEntry: (workerId: string, ym: string) => ReportEntryLike | null,
  itemsById: Record<string, Pick<OrgPayrollItemRow, "category">>,
  fy: number,
): Report36Result {
  const toTotals = (workerId: string, yms: string[]): MonthTotals[] =>
    yms
      .map((ym) => {
        const d = getEntry(workerId, ym);
        if (!d) return null;
        return entryToMonthTotals(
          {
            ym,
            work_days: d.work_days,
            total_hours: d.total_hours,
            overtime_hours: d.overtime_hours,
            amounts: d.amounts,
            excluded: d.excluded,
          },
          itemsById,
        );
      })
      .filter((m): m is MonthTotals => m != null);

  const ones: { months: MonthTotals[] }[] = [];
  const twos: { months: MonthTotals[] }[] = [];
  const targets1: { baseCurrent: number; basePrevious: number }[] = [];
  const targets2: { baseCurrent: number; basePrevious: number }[] = [];
  for (const row of rows) {
    let months = toTotals(row.id, reportMonthsFor(row, fy, fy));
    const two = !!row.grade2From && gradeStartYm(row.grade2From) <= `${fy + 1}-03`;
    if (two) {
      // 2号へ移行した人: 変更許可月（月の途中なら翌月）より前の月は記載しない（要領）
      const from = gradeStartYm(row.grade2From);
      months = months.filter((m) => m.ym >= from);
      twos.push({ months });
    } else {
      ones.push({ months });
    }
    // 昇給率（2年以上継続の人だけ）: 当年度と前年度の基準額がそろった人で算出
    if (row.prevYear) {
      const cur = raiseBase(months);
      const prev = raiseBase(toTotals(row.id, reportMonthsFor(row, fy, fy - 1)));
      if (cur != null && prev != null) {
        (two ? targets2 : targets1).push({ baseCurrent: cur, basePrevious: prev });
      }
    }
  }
  return {
    one: buildSection36(ones),
    two: buildSection36(twos),
    oneCount: ones.length,
    twoCount: twos.length,
    raise1: raiseRate(targets1),
    raise2: raiseRate(targets2),
    raise1Targets: targets1.length,
    raise2Targets: targets2.length,
  };
}

// 別紙1の「活動日数の総数（年間）」「報酬の支給総額（年間）」。
// 平均とは違い、入力のある月は除外月も含めてぜんぶ合計する（実績の総数のため）
export function workerAnnualTotals(
  row: PayrollRequestRow,
  getEntry: (workerId: string, ym: string) => ReportEntryLike | null,
  itemsById: Record<string, Pick<OrgPayrollItemRow, "category">>,
  fy: number,
): { days: number; pay: number } {
  let days = 0;
  let pay = 0;
  for (const ym of reportMonthsFor(row, fy, fy)) {
    const d = getEntry(row.id, ym);
    if (!d) continue;
    const t = entryToMonthTotals(
      { ym, work_days: d.work_days, total_hours: d.total_hours, overtime_hours: d.overtime_hours, amounts: d.amounts, excluded: false },
      itemsById,
    );
    days += t.workDays ?? 0;
    pay += (t.cashPay ?? 0) + t.bonus;
  }
  return { days: round0(days), pay: round0(pay) };
}
