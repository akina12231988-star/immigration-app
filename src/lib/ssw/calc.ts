// 特定技能1号 通算期間計算（旧HTML版 calcWorker() の移植）
//
// 旧版からの唯一の仕様変更: 通算対象が「特定技能1号」のみ
// → COUNTED_VISAS（特定活動〔特定技能1号移行準備〕を含む）に拡大。
// それ以外の計算式は旧版と同一に保つこと（calc.test.ts で担保）。
//
// 通算は日数合算による目安であり、正式な判断は出入国在留管理庁による。
// "今日" に依存する計算のため、結果は保存せず表示のたびに呼び出す。

import { COUNTED_VISAS, type SswStatus, type WorkHistory } from "@/types/ssw";

const DAY = 86_400_000;
// 1か月 = 30.4375日（365.25 ÷ 12）の近似で年月日換算する
const AVG_MONTH = 30.4375;
// 60か月ゲージの上限
export const CAP_MONTHS = 60;

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addYears(dateStr: string, years: number): Date {
  const dt = d(dateStr);
  dt.setUTCFullYear(dt.getUTCFullYear() + years);
  return dt;
}

// 在留日数（開始日・終了日の両端を含む）。終了日が空なら今日まで継続中とみなす
export function entryDays(h: Pick<WorkHistory, "start" | "end">, today: string): number {
  const end = h.end || today;
  return Math.max(Math.round((d(end).getTime() - d(h.start).getTime()) / DAY) + 1, 0);
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

function toYMD(days: number): YMD {
  const months = Math.floor(days / AVG_MONTH);
  return {
    y: Math.floor(months / 12),
    m: months % 12,
    d: Math.round(days - months * AVG_MONTH),
  };
}

export const ymdText = (o: YMD): string => `${o.y}年${o.m}か月`;
export const ymdFullText = (o: YMD): string => `${o.y}年${o.m}か月${o.d}日`;

export interface SswCalcResult {
  hist: WorkHistory[]; // 全職歴（開始日昇順）
  counted: WorkHistory[]; // 通算カウント対象の行のみ
  usedDays: number; // 通算在留日数
  capDays: number; // 5年上限の実日数（起点から暦上5年）
  remainDays: number; // 上限までの残日数
  firstStart: string | null; // カウント起点（最初の対象期間の開始日）
  ongoing: boolean; // 対象期間が継続中か
  used: YMD;
  remain: YMD;
  usedMonths: number; // 0〜60（ゲージ表示用）
  expiry: string | null; // 満了予定日（継続中かつ残あり時のみ）
  status: SswStatus;
}

export function calcSsw(history: WorkHistory[], today: string = todayStr()): SswCalcResult {
  const hist = [...history].sort((a, b) => (a.start < b.start ? -1 : 1));
  const counted = hist.filter((h) => COUNTED_VISAS.has(h.visa));
  const usedDays = counted.reduce((sum, h) => sum + entryDays(h, today), 0);
  const firstStart = counted.length ? counted[0].start : null;
  const ongoing = counted.some((h) => !h.end || h.end >= today);

  let capDays = Math.round(5 * 365.25);
  if (firstStart) {
    capDays = Math.round((addYears(firstStart, 5).getTime() - d(firstStart).getTime()) / DAY);
  }
  const remainDays = Math.max(capDays - usedDays, 0);

  let expiry: string | null = null;
  if (firstStart && ongoing && remainDays > 0) {
    const e = d(today);
    e.setUTCDate(e.getUTCDate() + remainDays - 1);
    expiry = toDateStr(e);
  }

  const status: SswStatus = !counted.length
    ? "1号期間未登録"
    : remainDays === 0
      ? "5年到達"
      : ongoing
        ? "1号在留中"
        : "中断中";

  return {
    hist,
    counted,
    usedDays,
    capDays,
    remainDays,
    firstStart,
    ongoing,
    used: toYMD(usedDays),
    remain: toYMD(remainDays),
    usedMonths: Math.min(Math.floor(usedDays / AVG_MONTH), CAP_MONTHS),
    expiry,
    status,
  };
}
