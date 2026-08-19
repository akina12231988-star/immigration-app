import { daysUntil } from "@/lib/worker-alerts";
import type { ApplicationExtraRequest } from "@/types/application";

// 入管から求められた追加資料の「提出期限」のアラート。
// 申請一覧の「＜入管＞追加資料」タブで、急ぎのものが上に来るようにする。

type DueFields = Pick<ApplicationExtraRequest, "due_on" | "status">;

export type ExtraRequestAlert =
  | "done" // 郵送済み（完了）
  | "overdue" // 期限を過ぎている
  | "today" // 今日が期限
  | "soon" // 期限まで3日以内
  | "normal" // まだ余裕がある
  | "none"; // 期限が未設定

// 期限まで何日で「もうすぐ」とするか
const SOON_DAYS = 3;

export function isExtraRequestOpen(r: Pick<ApplicationExtraRequest, "status">): boolean {
  return r.status !== "郵送済み";
}

export function extraRequestAlert(r: DueFields, today: string): ExtraRequestAlert {
  if (!isExtraRequestOpen(r)) return "done";
  if (!r.due_on) return "none";
  const d = daysUntil(r.due_on, today);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  return d <= SOON_DAYS ? "soon" : "normal";
}

// 画面に出す提出期限の文字（あと何日か・何日超過かまで書く）
export function extraRequestDueLabel(dueOn: string | null, today: string): string {
  if (!dueOn) return "提出期限 未設定";
  const d = daysUntil(dueOn, today);
  if (d === 0) return `提出期限 ${dueOn}（本日まで）`;
  return d > 0 ? `提出期限 ${dueOn}（あと${d}日）` : `提出期限 ${dueOn}（${-d}日超過）`;
}

// 未完了のうち、期限を過ぎている・今日・3日以内のもの（赤や黄色で出す対象）
export function isExtraRequestUrgent(r: DueFields, today: string): boolean {
  const a = extraRequestAlert(r, today);
  return a === "overdue" || a === "today" || a === "soon";
}

// 並び順: 未完了が先 → 期限が近い順（未設定は後ろ）→ 依頼が来た日が新しい順
export function sortExtraRequests<
  T extends Pick<ApplicationExtraRequest, "due_on" | "status" | "requested_on">,
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const openDiff = Number(!isExtraRequestOpen(a)) - Number(!isExtraRequestOpen(b));
    if (openDiff !== 0) return openDiff;
    if ((a.due_on ?? "") !== (b.due_on ?? "")) {
      if (!a.due_on) return 1;
      if (!b.due_on) return -1;
      return a.due_on < b.due_on ? -1 : 1;
    }
    return (b.requested_on ?? "").localeCompare(a.requested_on ?? "");
  });
}

// 未完了の件数（タブのバッジに出す）
export function countOpenExtraRequests(rows: Pick<ApplicationExtraRequest, "status">[]): number {
  return rows.filter(isExtraRequestOpen).length;
}
