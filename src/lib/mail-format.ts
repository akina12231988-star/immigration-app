import type { MailCategory } from "@/types/db";

// カテゴリのバッジ配色（ダッシュボードのステータス色に合わせる）
export function categoryChipClass(category: MailCategory): string {
  switch (category) {
    case "許可":
      return "bg-status-approved-bg text-status-approved-fg";
    case "申請受付":
      return "bg-status-applied-bg text-status-applied-fg";
    default:
      return "bg-background text-muted";
  }
}

// 受信日時を「たった今 / ○分前 / ○時間前 / ○日前 / 日付」で表示する
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 60) return "たった今";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}日前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
