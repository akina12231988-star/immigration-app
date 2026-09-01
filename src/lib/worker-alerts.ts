import type { Worker } from "@/types/db";

// アラート判定に必要な項目だけ。一覧は列を絞って取るため、
// 全項目の Worker ではなくこの形を受け取る
export type AlertWorker = Pick<
  Worker,
  | "status"
  | "residence_expiry_date"
  | "residence_renewal_status"
  | "passport_expiry_date"
  | "ssw_insurance_expiry_date"
>;

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

// 2つの YYYY-MM-DD の差を「〇ヶ月〇日」で返す（絶対値・暦計算）
function monthsDaysBetween(a: string, b: string): { months: number; days: number } {
  let from = new Date(`${a}T00:00:00Z`);
  let to = new Date(`${b}T00:00:00Z`);
  if (from > to) [from, to] = [to, from];
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  let days = to.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months -= 1;
    // to の前月の日数を足す
    const prev = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 0));
    days += prev.getUTCDate();
  }
  return { months, days };
}

// 「あと〇ヶ月〇日」「〇ヶ月〇日超過」の表記
export function remainingLabel(target: string, today: string): string {
  const d = daysUntil(target, today);
  if (d === 0) return "本日";
  const { months, days } = monthsDaysBetween(target, today);
  const span =
    months > 0 ? (days > 0 ? `${months}ヶ月${days}日` : `${months}ヶ月`) : `${days}日`;
  return d > 0 ? `あと${span}` : `${span}超過`;
}

// 在留期限まで2ヶ月以内（または既に超過）。申請前の「早く申請して」アラート用
export function isExpiryWithinTwoMonths(expiry: string, today: string): boolean {
  return today >= addMonths(expiry, -2);
}

// 申請準備（在留更新）の対象にする月数。在留期限のこの月数前から一覧に出す。
// 前もって準備できるよう4か月前からにしている。
export const RESIDENCE_RENEWAL_MONTHS = 4;

// 更新準備の一覧「在留期限をいつまで表示するか」の初期値（今日から4か月後）
export function residenceRenewalDefaultUntil(today: string): string {
  return addMonths(today, RESIDENCE_RENEWAL_MONTHS);
}

// 在留更新対象: 在留期限まで4か月以内（または既に超過）。期限未登録は対象外。
// 退職者は在留更新の対象から外す。
export function isResidenceRenewalTarget(
  // 使うのは在籍状況と在留期限だけ（在留カードの有無に関わらず判定できるようにする）
  w: Pick<AlertWorker, "status" | "residence_expiry_date">,
  today: string,
): boolean {
  if (w.status === "退職") return false;
  if (!w.residence_expiry_date) return false;
  return today >= addMonths(w.residence_expiry_date, -RESIDENCE_RENEWAL_MONTHS);
}

// まだ対応が済んでいない在留更新対象（帰国・転職先にて対応中・準備中は対応済み扱い）
export function isResidenceRenewalPending(w: AlertWorker, today: string): boolean {
  return isResidenceRenewalTarget(w, today) && w.residence_renewal_status === "";
}

// パスポート更新必要: 有効期限まで半年（6か月）以内（または既に超過）。期限未登録は対象外。
export function isPassportRenewalTarget(
  w: Pick<AlertWorker, "passport_expiry_date">,
  today: string,
): boolean {
  if (!w.passport_expiry_date) return false;
  return today >= addMonths(w.passport_expiry_date, -6);
}

// パスポート更新必要の一覧・メニューのアラートに出す人:
// 現在も支援中（支援対象かつ在籍中）の人だけに絞る（退職者・支援対象外は出さない）
export function isPassportRenewalListTarget(
  w: Pick<Worker, "support" | "status" | "passport_expiry_date">,
  today: string,
): boolean {
  if (w.support !== "支援対象" || w.status !== "在籍中") return false;
  return isPassportRenewalTarget(w, today);
}

// 特定技能総合保険の更新必要: 有効期限まで1か月以内（または既に超過）。期限未登録は対象外。
// 退職者は対象から外す。
export function isSswInsuranceRenewalTarget(w: AlertWorker, today: string): boolean {
  if (w.status === "退職") return false;
  if (!w.ssw_insurance_expiry_date) return false;
  return today >= addMonths(w.ssw_insurance_expiry_date, -1);
}
