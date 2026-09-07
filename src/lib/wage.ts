// 賃金（時給・月給など）の表示と、履歴からの「現在の賃金」の取り出し。
// 昇給のたびに記録を増やし、適用開始日がいちばん新しいものを現在の賃金として扱う。
//
// 申請時の賃金: 申請準備の段階では雇用開始日がまだ決まっていないことが多いので、
// 適用開始日を空（started_on = null）で入れられる。空は「雇用開始日から」の意味で、
// 雇用開始日が決まればその日を適用開始日として扱い、在籍中になったら
// 「採用時」の賃金として日付を書き込む（pendingWagePatch）。

import type { WorkerWage, WorkerWageKind } from "@/types/db";

// 理由の定型（申請時に入れた賃金は、雇用開始で採用時の賃金になる）
export const WAGE_REASON_APPLY = "申請時";
export const WAGE_REASON_HIRE = "採用時";
export const WAGE_REASON_RAISE = "昇給";

// 「時給1,100円」の表記
export function wageText(kind: WorkerWageKind | string, amount: number): string {
  if (!amount) return "";
  return `${kind}${amount.toLocaleString("ja-JP")}円`;
}

// 適用開始日が空（雇用開始日から）の記録か
export function isWageFromEmploymentStart(w: Pick<WorkerWage, "started_on">): boolean {
  return !w.started_on;
}

// その賃金の適用開始日。空なら雇用開始日、それも無ければ null（未定）
export function wageStartedOn(
  w: Pick<WorkerWage, "started_on">,
  employmentStartOn?: string | null,
): string | null {
  return w.started_on || employmentStartOn || null;
}

// 並べ替え用の日付。未定（雇用開始日が決まっていない）はこれから始まる賃金なので、
// いちばん新しい扱いにする
const UNDECIDED_SORT_KEY = "9999-12-31";

function sortKey(w: Pick<WorkerWage, "started_on">, employmentStartOn?: string | null): string {
  return wageStartedOn(w, employmentStartOn) ?? UNDECIDED_SORT_KEY;
}

// 適用開始日の表示。空なら「雇用開始日から（日付）」「雇用開始日から（未定）」
export function wageStartedOnLabel(
  w: Pick<WorkerWage, "started_on">,
  employmentStartOn?: string | null,
): string {
  if (w.started_on) return w.started_on;
  const on = wageStartedOn(w, employmentStartOn);
  return on ? `雇用開始日（${on}）から` : "雇用開始日から（未定）";
}

// 適用開始日の新しい順（同じ日なら登録の新しい順）
export function sortWages<T extends Pick<WorkerWage, "started_on" | "created_at">>(
  wages: T[],
  employmentStartOn?: string | null,
): T[] {
  return [...wages].sort((a, b) => {
    const d = sortKey(b, employmentStartOn).localeCompare(sortKey(a, employmentStartOn));
    return d !== 0 ? d : (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

// 現在の賃金（基準日までに始まっているもののうち、いちばん新しい1件）。
// 基準日を渡さなければ、いちばん新しい記録をそのまま返す。
// まだ始まっている賃金が無ければ（申請時の賃金だけなど）、いちばん新しい記録を返す
export function currentWage<T extends Pick<WorkerWage, "started_on" | "created_at">>(
  wages: T[],
  today?: string,
  employmentStartOn?: string | null,
): T | null {
  const sorted = sortWages(wages, employmentStartOn);
  const applied = today
    ? sorted.filter((w) => sortKey(w, employmentStartOn) <= today)
    : sorted;
  return applied[0] ?? sorted[0] ?? null;
}

// 前回からいくら上がったか（昇給額）。前がなければ null
export function wageRaise<T extends Pick<WorkerWage, "started_on" | "created_at" | "amount" | "kind">>(
  wages: T[],
  target: T,
  employmentStartOn?: string | null,
): number | null {
  const sorted = sortWages(wages, employmentStartOn);
  const i = sorted.indexOf(target);
  if (i < 0) return null;
  // 1つ古い記録のうち、同じ区分（時給どうし・月給どうし）だけを比べる
  const prev = sorted.slice(i + 1).find((w) => w.kind === target.kind);
  return prev ? target.amount - prev.amount : null;
}

// 前回からの上がり幅の割合（％）。前がなければ null。
// 例: 170,000円 → 187,000円 なら +10.0%
export function wageRaiseRate<
  T extends Pick<WorkerWage, "started_on" | "created_at" | "amount" | "kind">,
>(wages: T[], target: T, employmentStartOn?: string | null): number | null {
  const sorted = sortWages(wages, employmentStartOn);
  const i = sorted.indexOf(target);
  if (i < 0) return null;
  const prev = sorted.slice(i + 1).find((w) => w.kind === target.kind);
  if (!prev || !prev.amount) return null;
  return ((target.amount - prev.amount) / prev.amount) * 100;
}

// 雇用開始になったとき、申請時に入れた賃金（適用開始日が空）に書き込む内容。
// 適用開始日に雇用開始日を入れ、理由が「申請時」なら「採用時」に変える。
// 書き込むものが無ければ null
export function pendingWagePatch(
  w: Pick<WorkerWage, "started_on" | "reason">,
  employmentStartOn: string | null | undefined,
): { started_on: string; reason?: string } | null {
  if (w.started_on || !employmentStartOn) return null;
  return {
    started_on: employmentStartOn,
    ...(w.reason === WAGE_REASON_APPLY ? { reason: WAGE_REASON_HIRE } : {}),
  };
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
