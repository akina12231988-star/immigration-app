import type { Worker } from "@/types/db";

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// 2つの YYYY-MM-DD の差（target - today）を日数で返す。負なら過去。
export function daysUntil(target: string, today: string): number {
  const a = new Date(`${target}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

// 「あと〇日」「〇日超過」の表記
export function remainingLabel(target: string, today: string): string {
  const d = daysUntil(target, today);
  if (d > 0) return `あと${d}日`;
  if (d === 0) return "本日";
  return `${-d}日超過`;
}

// 在留更新対象: 在留期限まで3か月以内（または既に超過）。期限未登録は対象外。
export function isResidenceRenewalTarget(w: Worker, today: string): boolean {
  if (!w.residence_expiry_date) return false;
  return today >= addMonths(w.residence_expiry_date, -3);
}

// まだ対応が済んでいない在留更新対象（帰国・転職先にて対応中・準備中は対応済み扱い）
export function isResidenceRenewalPending(w: Worker, today: string): boolean {
  return isResidenceRenewalTarget(w, today) && w.residence_renewal_status === "";
}

// パスポート更新必要: 有効期限まで半年（6か月）以内（または既に超過）。期限未登録は対象外。
export function isPassportRenewalTarget(w: Worker, today: string): boolean {
  if (!w.passport_expiry_date) return false;
  return today >= addMonths(w.passport_expiry_date, -6);
}
