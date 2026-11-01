// 試験の再受験（不合格のあと、次に受けられる日）。
//
// 特定技能の評価試験（プロメトリックなど）は、不合格のあと「受験日の翌日から起算して45日間」は
// 再受験できず、45日間が経過した日（受験日の46日後）以降の試験日でしか予約できない。
//   例: 2026-10-30 に受験 → 2026-10-31〜2026-12-14 の45日間は受験できない → 2026-12-15 以降の試験日で申し込める

import { addDaysYmd } from "@/lib/support-plan-dates";

export const EXAM_RETAKE_WAIT_DAYS = 45;

const isYmd = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export interface ExamRetake {
  waitFrom: string; // 受験できない期間の始まり（受験日の翌日）
  waitUntil: string; // 受験できない期間の終わり（受験日の翌日から数えて45日目）
  availableOn: string; // この日以降の試験日なら申し込める
}

// 受験日から、受験できない期間と申し込める日を出す。受験日が無ければ null
export function examRetake(examDate: string | null | undefined): ExamRetake | null {
  if (!isYmd(examDate)) return null;
  return {
    waitFrom: addDaysYmd(examDate, 1),
    waitUntil: addDaysYmd(examDate, EXAM_RETAKE_WAIT_DAYS),
    availableOn: addDaysYmd(examDate, EXAM_RETAKE_WAIT_DAYS + 1),
  };
}

// 申し込める日まであと何日か（今日がその日以降なら 0）
export function daysUntilRetake(availableOn: string, today: string): number {
  if (!isYmd(availableOn) || !isYmd(today) || today >= availableOn) return 0;
  const ms = Date.parse(`${availableOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// 次の回の試験日が、前の回の不合格から45日間の中に入っている（受験できない日）か
export function examDateTooEarly(nextExamDate: string | null | undefined, availableOn: string | null | undefined): boolean {
  return isYmd(nextExamDate) && isYmd(availableOn) && nextExamDate < availableOn;
}
