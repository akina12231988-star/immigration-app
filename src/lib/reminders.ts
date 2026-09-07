// 督促（外国人への連絡と返事の進捗管理）のロジック。
//
// 番号は保管ボックスと同じ考え方で使う:
//   ・1〜30番を「箱」として持ち、進行中の督促に番号を割り当てる
//   ・完了すると番号が空きになり、次の人に同じ番号を割り当てられる
//   ・30番まで全部埋まっているときだけ、31番以降を割り当てる
// 進捗は「未連絡 → 連絡済み（返事待ち） → 返事あり → 完了」。
// 「返事待ち」の人を一覧の上に出して、誰から返事をもらっていないかを見えるようにする。

import type { Reminder, ReminderStatus } from "@/types/db";

export { REMINDER_KINDS, REMINDER_STATUSES } from "@/types/db";

// 箱の数（この番号までを保管ボックスのように使う）
export const REMINDER_BOX_SIZE = 30;

// 番号の表示（No.01 のように2桁でそろえる。31番以降はそのまま）
export function formatReminderNo(no: number): string {
  return `No.${String(no).padStart(2, "0")}`;
}

// 次に割り当てる番号。進行中の番号を避けて、1〜30の中で最小の空き番号。
// 30番まで全部埋まっていれば、31番以降で最小の空き番号
export function nextReminderNo(activeNos: number[]): number {
  const used = new Set(activeNos);
  for (let n = 1; n <= REMINDER_BOX_SIZE; n++) if (!used.has(n)) return n;
  let n = REMINDER_BOX_SIZE + 1;
  while (used.has(n)) n++;
  return n;
}

// 完了していない（番号を使っている）督促か
export function isReminderOpen(status: string): boolean {
  return status !== "完了";
}

// 本人に連絡したのに返事をもらえていない督促か
export function isAwaitingReply(status: string): boolean {
  return status === "連絡済み（返事待ち）";
}

// 進捗を変えたときに自動で入れる日付（すでに入っていれば変えない）
export function reminderStatusPatch(
  r: Pick<Reminder, "contacted_on" | "replied_on" | "completed_on">,
  status: ReminderStatus,
  today: string,
): Partial<Reminder> {
  const patch: Partial<Reminder> = { status };
  if (status === "連絡済み（返事待ち）" && !r.contacted_on) patch.contacted_on = today;
  if (status === "返事あり") {
    if (!r.contacted_on) patch.contacted_on = today;
    if (!r.replied_on) patch.replied_on = today;
  }
  if (status === "完了") {
    if (!r.completed_on) patch.completed_on = today;
  } else {
    patch.completed_on = null; // 完了を取り消したら完了日も消す（番号を使い直す）
  }
  return patch;
}

// 日数（today - from）。日付が無ければ null
export function daysSince(from: string | null, today: string): number | null {
  if (!from) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// 一覧の並び: 進行中を番号順に。完了は完了日の新しい順で後ろ
export function sortReminders<T extends Pick<Reminder, "reminder_no" | "status" | "completed_on" | "created_at">>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const oa = isReminderOpen(a.status) ? 0 : 1;
    const ob = isReminderOpen(b.status) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (oa === 0) return a.reminder_no - b.reminder_no;
    const ca = a.completed_on ?? a.created_at;
    const cb = b.completed_on ?? b.created_at;
    return cb.localeCompare(ca);
  });
}

// 箱の見え方（1〜30と、31番以降の使用中の番号）。
// 各番号にどの督促が入っているか（空きは null）
export function reminderBoxes<T extends Pick<Reminder, "reminder_no" | "status">>(
  rows: T[],
): { no: number; reminder: T | null }[] {
  const open = rows.filter((r) => isReminderOpen(r.status));
  const byNo = new Map(open.map((r) => [r.reminder_no, r]));
  const max = Math.max(REMINDER_BOX_SIZE, ...open.map((r) => r.reminder_no));
  const boxes: { no: number; reminder: T | null }[] = [];
  for (let n = 1; n <= max; n++) {
    const reminder = byNo.get(n) ?? null;
    // 31番以降は使っている番号だけ出す
    if (n > REMINDER_BOX_SIZE && !reminder) continue;
    boxes.push({ no: n, reminder });
  }
  return boxes;
}

// 進捗ごとの件数（画面の見出し用）
export function reminderCounts<T extends Pick<Reminder, "status">>(rows: T[]): {
  open: number;
  notContacted: number;
  awaiting: number;
  replied: number;
} {
  return {
    open: rows.filter((r) => isReminderOpen(r.status)).length,
    notContacted: rows.filter((r) => r.status === "未連絡").length,
    awaiting: rows.filter((r) => isAwaitingReply(r.status)).length,
    replied: rows.filter((r) => r.status === "返事あり").length,
  };
}

// 外国人詳細のアラート文（進行中の督促だけ）
export function reminderAlertText(r: Pick<Reminder, "reminder_no" | "status" | "kind" | "content" | "contacted_on">, today: string): string {
  const head = `${formatReminderNo(r.reminder_no)} ${r.kind || "督促"}${r.content ? `：${r.content}` : ""}`;
  if (isAwaitingReply(r.status)) {
    const d = daysSince(r.contacted_on, today);
    return `${head} … 返事待ち${d !== null && d > 0 ? `（連絡から${d}日）` : ""}`;
  }
  if (r.status === "返事あり") return `${head} … 返事あり（手続き中）`;
  return `${head} … 未連絡`;
}
