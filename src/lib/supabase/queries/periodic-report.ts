import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgPayrollItemRow, PeriodicReportEntryRow } from "@/types/db";

// ---- 定期報告書（3-6号）のための賃金台帳の入力（0236_periodic_report.sql） ----
// org_payroll_items … 機関ごとの賃金台帳の項目（届いた賃金台帳と同じ名前・並び）
// periodic_report_entries … 人×月の実績（賃金台帳1か月分の転記）

export async function listOrgPayrollItems(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrgPayrollItemRow[]> {
  const { data, error } = await supabase
    .from("org_payroll_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as OrgPayrollItemRow[]) ?? [];
}

// 項目の保存（まとめて upsert）。id は画面側で作る（新しい行の金額もすぐ項目に紐づけられるように）
export async function upsertOrgPayrollItems(
  supabase: SupabaseClient,
  items: Pick<OrgPayrollItemRow, "id" | "organization_id" | "name" | "category" | "sort_order">[],
): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase.from("org_payroll_items").upsert(items, { onConflict: "id" });
  if (error) throw error;
}

// 項目を消す（入力済みの金額は amounts jsonb に残るが、項目が無いので集計に入らない）
export async function deleteOrgPayrollItems(
  supabase: SupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("org_payroll_items").delete().in("id", ids);
  if (error) throw error;
}

// 機関の入力済みの実績（期間指定。前年度分もまとめて取るときは from を前年度の4月にする）
export async function listPeriodicReportEntries(
  supabase: SupabaseClient,
  organizationId: string,
  fromYm: string,
  toYm: string,
): Promise<PeriodicReportEntryRow[]> {
  const { data, error } = await supabase
    .from("periodic_report_entries")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("ym", fromYm)
    .lte("ym", toYm)
    .order("ym", { ascending: true });
  if (error) throw error;
  return (data as PeriodicReportEntryRow[]) ?? [];
}

export type PeriodicReportEntryInput = Pick<
  PeriodicReportEntryRow,
  "organization_id" | "worker_id" | "ym" | "work_days" | "total_hours" | "overtime_hours" | "amounts" | "excluded" | "note"
>;

// 人×月の実績の保存（同じ人・同じ月は上書き）
export async function upsertPeriodicReportEntries(
  supabase: SupabaseClient,
  entries: PeriodicReportEntryInput[],
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabase
    .from("periodic_report_entries")
    .upsert(entries, { onConflict: "organization_id,worker_id,ym" });
  if (error) throw error;
}

// 「この人は今年度の対象から外す」の記録。月の実績と同じ表に、実在しない月
// 'YYYY-00'（年度の目印）で1行だけ持つ（excluded = 外した / note = 理由）。
// 実際の月は 'YYYY-04'〜'YYYY+1-03' なのでぶつからず、集計は実在の月しか見ない
export function periodicExcludeYm(fy: number): string {
  return `${fy}-00`;
}
