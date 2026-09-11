// 督促（外国人への連絡と返事の進捗管理）のロジック。
//
// 番号は保管ボックスと同じ考え方で使う:
//   ・1〜30番を「箱」として持ち、進行中の督促に番号を割り当てる
//   ・完了すると番号が空きになり、次の人に同じ番号を割り当てられる
//   ・30番まで全部埋まっているときだけ、31番以降を割り当てる
// 進捗は「未連絡 → 連絡済み（返事待ち） → 返事あり → 完了」。
// 「返事待ち」の人を一覧の上に出して、誰から返事をもらっていないかを見えるようにする。

import type { Reminder, ReminderImage, ReminderImageKind, ReminderPayer, ReminderStatus } from "@/types/db";

export { REMINDER_KINDS, REMINDER_PAYERS, REMINDER_STATUSES } from "@/types/db";

// ---- 金額・誰が払うか（一覧表用。0151） ----

export const AMOUNT_MIGRATION = "0151_reminder_amount.sql";

export const PAYER_LABELS: Record<ReminderPayer, string> = { 本人: "本人が払う", 代わり: "代わりに払う" };

// 誰が払うか。未設定でも立替払いにチェックがあれば「代わり」
export function reminderPayer(r: Pick<Reminder, "payer" | "advance_paid">): ReminderPayer | "" {
  if (r.payer === "本人" || r.payer === "代わり") return r.payer;
  return r.advance_paid ? "代わり" : "";
}

export function payerLabel(r: Pick<Reminder, "payer" | "advance_paid">): string {
  const p = reminderPayer(r);
  return p ? PAYER_LABELS[p] : "";
}

// 一覧表に出す金額。金額が無ければ立て替えた金額
export function reminderAmount(r: Pick<Reminder, "amount" | "advance_amount">): number | null {
  return r.amount ?? r.advance_amount ?? null;
}

// 返金の確認（代わりに払ったときだけ）: 未返金 / 返金済み（日付）
export function repaymentLabel(
  r: Pick<Reminder, "payer" | "advance_paid" | "advance_repaid_on">,
): { text: string; unpaid: boolean } {
  if (reminderPayer(r) !== "代わり") return { text: "", unpaid: false };
  if (r.advance_repaid_on) return { text: `返金済み（${r.advance_repaid_on}）`, unpaid: false };
  return { text: "未返金", unpaid: true };
}

// 誰が払うかを変えたときの更新内容。代わりに払うなら立替払いを有効にし、金額を立替金額にも入れる
export function payerPatch(
  r: Pick<Reminder, "amount" | "advance_amount" | "advance_repaid_on">,
  payer: ReminderPayer | "",
): Partial<Reminder> {
  const patch: Partial<Reminder> = { payer };
  if (payer === "代わり") {
    patch.advance_paid = true;
    if (r.advance_amount == null && r.amount != null) patch.advance_amount = r.amount;
  } else if (!r.advance_repaid_on) {
    // 返金済みの記録があるときは立替の記録を消さない
    patch.advance_paid = false;
  }
  return patch;
}

// 一覧表（CSV）。Excel で開けるように BOM は呼び出し側で付ける
export function remindersCsv(
  rows: (Pick<Reminder, "created_at" | "reminder_no" | "kind" | "content" | "status" | "amount" | "advance_amount" | "payer" | "advance_paid" | "advance_repaid_on" | "advance_paid_on"> & {
    workerName: string;
    orgName: string;
  })[],
): string {
  const q = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["作成日", "番号", "氏名", "所属機関", "種類", "内容", "金額", "支払", "返金確認", "支払日（立替）", "進捗"];
  const lines = rows.map((r) =>
    [
      r.created_at.slice(0, 10),
      formatReminderNo(r.reminder_no),
      r.workerName,
      r.orgName,
      r.kind,
      r.content,
      reminderAmount(r) ?? "",
      payerLabel(r),
      repaymentLabel(r).text,
      r.advance_paid_on ?? "",
      r.status,
    ]
      .map(q)
      .join(","),
  );
  return [head.map(q).join(","), ...lines].join("\r\n");
}

// ---- 立替払い（本人の代わりに支払った分の返金の追いかけ。0150） ----

export const ADVANCE_MIGRATION = "0150_reminder_advance.sql";

type AdvanceFields = Pick<Reminder, "advance_paid" | "advance_amount" | "advance_paid_on" | "advance_repaid_on">;

// 立て替えたのに本人からまだ返金が無いか（未返金アラートの対象）
export function isAdvanceUnpaid(r: Pick<Reminder, "advance_paid" | "advance_repaid_on">): boolean {
  return !!r.advance_paid && !r.advance_repaid_on;
}

// 立て替えて、本人から返金済みか
export function isAdvanceRepaid(r: Pick<Reminder, "advance_paid" | "advance_repaid_on">): boolean {
  return !!r.advance_paid && !!r.advance_repaid_on;
}

// 金額の表示（12,000円）。無ければ「金額未入力」
export function advanceAmountLabel(amount: number | null | undefined): string {
  return amount == null ? "金額未入力" : `${amount.toLocaleString("ja-JP")}円`;
}

// 未返金のアラート文（一覧・外国人詳細）。例: 立替 12,000円 未返金（支払から10日）
export function advanceAlertText(r: AdvanceFields, today: string): string {
  if (!isAdvanceUnpaid(r)) return "";
  const d = daysSince(r.advance_paid_on ?? null, today);
  return `立替 ${advanceAmountLabel(r.advance_amount)} 未返金${d !== null && d > 0 ? `（支払から${d}日）` : ""}`;
}

// 本人から返金があったときの更新内容。返金日を入れ、督促も完了にする（完了日も入れる）
export function advanceRepaidPatch(
  r: Pick<Reminder, "completed_on" | "status">,
  repaidOn: string,
  today: string,
): Partial<Reminder> {
  const patch: Partial<Reminder> = { advance_repaid_on: repaidOn };
  if (r.status !== "完了") {
    patch.status = "完了";
    patch.completed_on = r.completed_on ?? today;
  }
  return patch;
}

// 立替が未返金のままでは完了にできない
export function completionBlockedReason(r: AdvanceFields): string | null {
  if (!isAdvanceUnpaid(r)) return null;
  return `立替 ${advanceAmountLabel(r.advance_amount)} が未返金です。本人から返金があったら「返金日」を入れてください（入れると完了になります）。`;
}

// 画像の種類（0150 より前の画像は会話のスクショ扱い）
export function reminderImageKind(img: Pick<ReminderImage, "kind">): ReminderImageKind {
  return img.kind === "receipt" || img.kind === "repayment" ? img.kind : "screenshot";
}

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
export function reminderCounts<T extends Pick<Reminder, "status" | "advance_paid" | "advance_repaid_on">>(rows: T[]): {
  open: number;
  notContacted: number;
  awaiting: number;
  replied: number;
  advanceUnpaid: number; // 立替の未返金
} {
  return {
    open: rows.filter((r) => isReminderOpen(r.status)).length,
    notContacted: rows.filter((r) => r.status === "未連絡").length,
    awaiting: rows.filter((r) => isAwaitingReply(r.status)).length,
    replied: rows.filter((r) => r.status === "返事あり").length,
    advanceUnpaid: rows.filter((r) => isAdvanceUnpaid(r)).length,
  };
}

// 外国人詳細のアラート文（進行中の督促だけ）。立替が未返金ならそれも添える
export function reminderAlertText(
  r: Pick<Reminder, "reminder_no" | "status" | "kind" | "content" | "contacted_on"> & Partial<AdvanceFields>,
  today: string,
): string {
  const head = `${formatReminderNo(r.reminder_no)} ${r.kind || "督促"}${r.content ? `：${r.content}` : ""}`;
  const advance = isAdvanceUnpaid(r) ? ` ／ ${advanceAlertText(r, today)}` : "";
  if (isAwaitingReply(r.status)) {
    const d = daysSince(r.contacted_on, today);
    return `${head} … 返事待ち${d !== null && d > 0 ? `（連絡から${d}日）` : ""}${advance}`;
  }
  if (r.status === "返事あり") return `${head} … 返事あり（手続き中）${advance}`;
  if (r.status === "完了") return `${head} … 完了${advance}`;
  return `${head} … 未連絡${advance}`;
}
