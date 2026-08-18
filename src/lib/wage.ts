// 賃金（時給・月給など）の表示と、履歴からの「現在の賃金」の取り出し。
// 昇給のたびに記録を増やし、適用開始日がいちばん新しいものを現在の賃金として扱う。

import type { WorkerWage, WorkerWageKind } from "@/types/db";

// 「時給1,100円」の表記
export function wageText(kind: WorkerWageKind | string, amount: number): string {
  if (!amount) return "";
  return `${kind}${amount.toLocaleString("ja-JP")}円`;
}

// 適用開始日の新しい順（同じ日なら登録の新しい順）
export function sortWages<T extends Pick<WorkerWage, "started_on" | "created_at">>(
  wages: T[],
): T[] {
  return [...wages].sort((a, b) => {
    const d = b.started_on.localeCompare(a.started_on);
    return d !== 0 ? d : (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

// 現在の賃金（基準日までに始まっているもののうち、いちばん新しい1件）。
// 基準日を渡さなければ、いちばん新しい記録をそのまま返す
export function currentWage<T extends Pick<WorkerWage, "started_on" | "created_at">>(
  wages: T[],
  today?: string,
): T | null {
  const sorted = sortWages(wages);
  const applied = today ? sorted.filter((w) => w.started_on <= today) : sorted;
  return applied[0] ?? sorted[0] ?? null;
}

// 前回からいくら上がったか（昇給額）。前がなければ null
export function wageRaise<T extends Pick<WorkerWage, "started_on" | "created_at" | "amount" | "kind">>(
  wages: T[],
  target: T,
): number | null {
  const sorted = sortWages(wages);
  const i = sorted.indexOf(target);
  if (i < 0) return null;
  // 1つ古い記録のうち、同じ区分（時給どうし・月給どうし）だけを比べる
  const prev = sorted.slice(i + 1).find((w) => w.kind === target.kind);
  return prev ? target.amount - prev.amount : null;
}

// ---- 時給 ⇔ 月給の換算（雇用条件書と同じ考え方） ----
//
//   時給 = 月給 × 12ヶ月 ÷ 年間所定労働時間数
//   月給 = 時給 × 年間所定労働時間数 ÷ 12ヶ月
//
// 年間所定労働時間は会社ごとに違うため、所属機関に登録した値を使う（0 は未登録）。

// 月給 → 時給（円・四捨五入）。換算できないときは null
export function hourlyFromMonthly(monthly: number, annualHours: number): number | null {
  if (!monthly || !annualHours) return null;
  return Math.round((monthly * 12) / annualHours);
}

// 時給 → 月給（円・四捨五入）。換算できないときは null
export function monthlyFromHourly(hourly: number, annualHours: number): number | null {
  if (!hourly || !annualHours) return null;
  return Math.round((hourly * annualHours) / 12);
}

// 賃金の区分に応じた換算の表示（例: 月給187,000円 → 「時給 約1,122円」）。
// 時給・月給以外（日給・年収）は換算しない
export function wageConversionText(
  kind: WorkerWageKind | string,
  amount: number,
  annualHours: number,
): string | null {
  if (kind === "月給") {
    const hourly = hourlyFromMonthly(amount, annualHours);
    return hourly == null ? null : `時給 約${hourly.toLocaleString("ja-JP")}円`;
  }
  if (kind === "時給") {
    const monthly = monthlyFromHourly(amount, annualHours);
    return monthly == null ? null : `月給 約${monthly.toLocaleString("ja-JP")}円`;
  }
  return null;
}
