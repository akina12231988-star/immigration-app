import type { Application } from "@/types/application";

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// 申請時点の在留期限から1か月後の日付（アラート開始）
export function oneMonthAfter(dateStr: string): string {
  return addMonths(dateStr, 1);
}

// 経過措置終了日（在留期限から2か月後）。この日までに受取を済ませる必要がある
export function transitionEndDate(dateStr: string): string {
  return addMonths(dateStr, 2);
}

// 「7月14日」のような月日表記に整形
export function formatMonthDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

// 在留期限アラート判定（要件④）:
// 申請後・未受取（在留カード受領前）で、申請時点の在留期限から1か月が経過している。
// 取下げ済みは対象外。
export function isExpiryAlert(app: Application, today: string): boolean {
  if (app.status === "取下げ" || app.status === "在留カード受領") return false;
  if (app.status === "申請前") return false;
  if (!app.residenceExpiryAtApply) return false;
  return today >= oneMonthAfter(app.residenceExpiryAtApply);
}

export function countExpiryAlerts(apps: Application[], today: string): number {
  return apps.filter((a) => isExpiryAlert(a, today)).length;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
