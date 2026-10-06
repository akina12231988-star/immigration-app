// 最低賃金の改定に伴う「時給のご確認」のお願い（所属機関へFAXで送るA4横の案内文）。
//
// 所属機関のページの在籍名簿から印刷する。改定後の最低賃金・適用日・都道府県・返信期限は
// 印刷画面で変えられる（熊本県以外の機関にも使えるように）。
// 名簿には在籍中の人に加えて、申請が審査中（在留カードの受け取りがまだ）の人も並べ、
// 当方に登録のある現在の賃金を出し、改定後の時給を書いてもらう欄を付ける。

import { warekiDate } from "@/lib/dependents";
import { MINIMUM_WAGES } from "@/lib/minimum-wage";

// 令和8年12月1日からの熊本県の最低賃金（印刷画面の初期値。画面で変えられる）
export const WAGE_NOTICE_DEFAULTS = {
  prefecture: "熊本県",
  hourly: 1092,
  effectiveOn: "2026-12-01",
} as const;

// 返信期限の初期値（印刷日の2週間後）
export const WAGE_NOTICE_REPLY_DAYS = 14;

export interface WageNoticeValues {
  prefecture: string; // 最低賃金の都道府県（例: 熊本県）
  hourly: string; // 改定後の最低賃金（時間額・円）。入力欄なので文字列
  effectiveOn: string; // 適用日 YYYY-MM-DD
  replyBy: string; // 返信期限 YYYY-MM-DD
  sentOn: string; // 送信日 YYYY-MM-DD
  pages: string; // 送信枚数
  staff: string; // 担当者
  fax: string; // 返信先のFAX番号
}

export function defaultWageNoticeValues(today: string, staff: string, fax: string): WageNoticeValues {
  // 都道府県の表に改定後の額が入っていればそれを使う（毎年の更新で表を直したあとも合うように）
  const entry = MINIMUM_WAGES[WAGE_NOTICE_DEFAULTS.prefecture];
  const useTable = !!entry && entry.effectiveOn >= WAGE_NOTICE_DEFAULTS.effectiveOn;
  return {
    prefecture: WAGE_NOTICE_DEFAULTS.prefecture,
    hourly: String(useTable ? entry.hourly : WAGE_NOTICE_DEFAULTS.hourly),
    effectiveOn: useTable ? entry.effectiveOn : WAGE_NOTICE_DEFAULTS.effectiveOn,
    replyBy: addDaysYmd(today, WAGE_NOTICE_REPLY_DAYS),
    sentOn: today,
    pages: "1",
    staff,
    fax,
  };
}

export function addDaysYmd(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

// 「令和8年12月1日（火）」。和暦にならない日付はそのまま
export function warekiDateWithDow(ymd: string): string {
  const base = warekiDate(ymd) || ymd;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return base;
  const dow = DOW[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${base}（${dow}）`;
}

// 「12月1日」（本文で短く言うとき）
export function monthDayText(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[2])}月${Number(m[3])}日` : ymd;
}

// 金額を「1,092」の形に
export function yenText(n: number | string): string {
  const v = typeof n === "string" ? Number(n.replace(/[^0-9]/g, "")) : n;
  return Number.isFinite(v) && v > 0 ? v.toLocaleString("ja-JP") : "";
}

// 名簿の「現在の時給」の欄。時給はその額、ほかの区分は区分を添える（例: 月給 220,000円）。未登録は空
export function currentWageCell(kind: string | null | undefined, amount: number | null | undefined): string {
  if (!kind || amount == null || amount <= 0) return "";
  return kind === "時給" ? `${amount.toLocaleString("ja-JP")}円` : `${kind} ${amount.toLocaleString("ja-JP")}円`;
}

// 現在の時給が改定後の最低賃金を下回る人か（時給の人だけ判定。月給などは判定しない）
export function belowNewMinimum(kind: string | null | undefined, amount: number | null | undefined, hourly: number): boolean {
  return kind === "時給" && amount != null && amount > 0 && hourly > 0 && amount < hourly;
}

// 名簿に並べる人。在籍中の人の後ろに、審査中（申請を出していて在留カードの受け取りがまだ）の人を足す。
// 状態が「在籍中」ではない人（申請準備中など）は、申請が審査中の人だけを「審査中」として載せる
export type WageNoticeWorker<T> = T & { underReview: boolean };

export function pickWageNoticeWorkers<T extends { id: string }>(
  active: T[],
  notYet: T[],
  underReviewIds: Set<string>,
): WageNoticeWorker<T>[] {
  return [
    ...active.map((w) => ({ ...w, underReview: false })),
    ...notYet.filter((w) => underReviewIds.has(w.id)).map((w) => ({ ...w, underReview: true })),
  ];
}

// 本文の「貴社に在籍中の特定技能外国人について」。審査中の人が名簿に入っていれば「在籍中・審査中」にする
export function wageNoticeTargetText(workers: { underReview: boolean }[]): string {
  const hasUnderReview = workers.some((w) => w.underReview);
  return hasUnderReview ? "貴社に在籍中・審査中の特定技能外国人について" : "貴社に在籍中の特定技能外国人について";
}

// 印刷（PDF保存）のファイル名
export function wageNoticeFileName(orgName: string): string {
  const name = (orgName ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
  return name ? `最低賃金の案内_${name}` : "最低賃金の案内";
}
