// 外国人のA4印刷（個人票・一覧表）で、期間の絞り込みに使う日付の種類。
//   permit     … 在留許可日（既定）
//   leaving    … 退職日
//   employment … その所属機関での雇用開始日（請求書作成の「対象の年月に雇用開始した人」の印刷に使う）
import { employmentStartForOrg } from "@/lib/monthly-billing";
import { monthRange } from "@/lib/monthly-billing";

export type PrintDateMode = "permit" | "leaving" | "employment";

// URL の date パラメータ → 日付の種類（不明な値は在留許可日）
export function printDateMode(param: string | undefined): PrintDateMode {
  if (param === "leaving") return "leaving";
  if (param === "employment") return "employment";
  return "permit";
}

// 日付の種類 → URL の date パラメータ（既定の在留許可日は空）
export function printDateParam(mode: PrintDateMode): string {
  return mode === "permit" ? "" : mode;
}

export function printDateLabel(mode: PrintDateMode): string {
  if (mode === "leaving") return "退職日";
  if (mode === "employment") return "雇用開始日";
  return "在留許可日";
}

// 絞り込みに使う雇用開始日。所属機関を指定していればその機関での雇用開始日
// （所属機関別の記録を優先）、指定がなければ外国人情報の雇用開始年月日
export function printEmploymentStart(
  worker: Parameters<typeof employmentStartForOrg>[0],
  organizationId: string,
): string {
  return organizationId
    ? employmentStartForOrg(worker, organizationId)
    : worker.employment_start_on || "";
}

// 雇用開始日が期間内か（from・to は空なら制限なし。雇用開始日が未登録なら含めない）
export function employmentStartInRange(
  worker: Parameters<typeof employmentStartForOrg>[0],
  organizationId: string,
  from: string,
  to: string,
): boolean {
  const start = printEmploymentStart(worker, organizationId);
  if (!start) return false;
  if (from && start < from) return false;
  if (to && start > to) return false;
  return true;
}

// 請求書作成から開く「対象の年月に雇用開始した人」の印刷URL。
// kind = "list" は一覧表（A4横・1表）、"sheets" は個人票（1人1ページ）
export function employmentStartPrintUrl(
  organizationId: string,
  month: string,
  kind: "list" | "sheets",
): string {
  const { from, to } = monthRange(month);
  const p = new URLSearchParams();
  p.set("org", organizationId);
  p.set("from", from);
  p.set("to", to);
  p.set("date", "employment");
  p.set("mode", kind === "list" ? "list" : "internal");
  return `/workers/print?${p.toString()}`;
}
