// 月末の請求書作成のための集計。
// 対象の年月（YYYY-MM）を決めると、その月に1日でも在籍していた支援対象の外国人を
// 所属機関ごとに並べ、1人ずつの支援費請求額（月額・日割り）を出す。
//
// 請求額の区分は3つ:
//   満額           … その月まるまる在籍 → 支援代（月額）そのまま
//   許可日から日割  … その月に支援が始まった → 1日あたり × 許可日から月末までの日数
//   退職日まで日割  … その月に退職した   → 1日あたり × 月初から退職日までの日数
// 1日あたり = 月額 ÷ その月の日数（小数点以下切り捨て）を先に出してから日数を掛ける
// （弊社の運用。例: 10,000円÷31日=322円 → 322円×15日=4,830円）。
//
// 「その月に支援が始まった」は、在留許可日がその月内で、かつ雇用開始日がその月より前でない
// （＝更新ではなく新しく支援を始めた）場合とする。更新で許可日がその月内でも、
// すでに支援している人は日割りせず満額にする。

import { dailyFee, daysInMonth, monthEnd, monthStart, nextMonthStart } from "@/lib/sales";
import { parseAmount } from "@/lib/organization-intake";
import { isSsw1Residence } from "@/lib/support-system";
import type { Organization, Worker } from "@/types/db";

// 請求額の区分
export type BillingKind = "満額" | "満額（更新月）" | "許可日から日割" | "退職日まで日割";

// 集計に必要な外国人の項目だけ（一覧の取得を軽くするため）
export type BillingWorker = Pick<
  Worker,
  | "id"
  | "name"
  | "kana"
  | "nationality"
  | "gender"
  | "birth"
  | "residence_status"
  | "residence_card_no"
  | "residence_permit_date"
  | "residence_expiry_date"
  | "employment_start_on"
  | "assigned_office"
  | "residence_note"
  | "recurring_sales_no"
  | "current_organization_id"
  | "support"
  | "status"
  | "leaving_on"
>;

export type BillingOrg = Pick<Organization, "id" | "name" | "intake">;

export interface MonthlyBillingRow {
  worker: BillingWorker;
  monthlyFee: number; // 支援代（月額）
  periodFrom: string; // 支援費算定期間の開始 YYYY-MM-DD
  periodTo: string; // 支援費算定期間の終了 YYYY-MM-DD
  days: number; // 対象日数
  monthDays: number; // その月の日数
  kind: BillingKind;
  amount: number; // 支援費請求額
  leftThisMonth: boolean; // その月に退職した
}

export interface MonthlyBillingOrg {
  organizationId: string;
  organizationName: string;
  rows: MonthlyBillingRow[];
  total: number; // 支援費請求額合計
  leftCount: number; // うち当月退職
}

export interface MonthlyBilling {
  month: string; // YYYY-MM
  monthEndOn: string; // 基準日（その月の末日）
  orgs: MonthlyBillingOrg[];
  totalPeople: number;
  totalLeft: number;
  totalAmount: number;
  unpriced: MonthlyBillingRow[]; // 所属機関に支援代（月額）が未登録の人
}

// YYYY-MM が正しい形か
export function isMonthStr(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

// その年月の初日・末日
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from: monthStart(from), to: monthEnd(from) };
}

// 「2026-07」→「2026年7月」
export function monthLabel(month: string): string {
  if (!isMonthStr(month)) return month;
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}

// 今月の YYYY-MM
export function currentMonth(today: string): string {
  return today.slice(0, 7);
}

// 請求日は対象月の翌月1日（その月の支援が終わってから請求するため）。
// 例: 対象月 2026-06 → 請求日 2026-07-01
export function invoiceBilledOn(month: string): string {
  return isMonthStr(month) ? nextMonthStart(`${month}-01`) : "";
}

// 支払期限は請求日と同じ月の末日。例: 対象月 2026-06 → 支払期限 2026-07-31
export function invoiceDueOn(month: string): string {
  const billed = invoiceBilledOn(month);
  return billed ? monthEnd(billed) : "";
}

// 支援費の請求対象になる在留資格か。
// 特定技能1号のほか、特定活動（特定技能1号移行準備）も支援を行うため対象にする
export function isBillableResidence(residenceStatus: string | null | undefined): boolean {
  const s = (residenceStatus ?? "").trim();
  if (!s) return false;
  if (isSsw1Residence(s)) return true;
  return s.includes("特定活動") && s.includes("特定技能1号");
}

// その月に1日でも在籍していた支援対象者か（＝在籍名簿に載り、支援費を請求する人）。
// 在留許可日がその月の末日までに来ていて、退職日がその月の初日以降（未退職を含む）。
// 支援対象外の人は請求も掲載もしない
export function isBilledInMonth(worker: BillingWorker, month: string): boolean {
  if (worker.support !== "支援対象") return false;
  if (!isBillableResidence(worker.residence_status)) return false;
  const { from, to } = monthRange(month);
  const permit = worker.residence_permit_date;
  if (!permit || permit > to) return false;
  const left = worker.leaving_on;
  if (left && left < from) return false;
  return true;
}

// 支援対象なのに名簿に載らない理由（載る場合と支援対象でない場合は null）。
// 「なぜ表示されないのか」を請求書作成の画面でそのまま見せるために使う
export function billingExclusionReason(worker: BillingWorker, month: string): string | null {
  if (worker.support !== "支援対象") return null; // 支援対象外は載らなくて正常
  if (isBilledInMonth(worker, month)) return null;
  const { from, to } = monthRange(month);
  if (!isBillableResidence(worker.residence_status)) {
    const s = (worker.residence_status ?? "").trim();
    return s ? `在留資格が対象外（${s}）` : "在留資格が未設定";
  }
  const permit = worker.residence_permit_date;
  if (!permit) return "在留許可日が未登録";
  if (permit > to) return `在留許可日が対象月より後（${permit}）`;
  const left = worker.leaving_on;
  if (left && left < from) return `対象月より前に退職済み（退職日 ${left}）`;
  return "掲載条件を満たしていません"; // 想定外（条件を増やしたときの取りこぼし防止）
}

// 1人分の請求額を出す。支援代（月額）が0以下なら金額0で区分は満額として返す
export function billingRowFor(
  worker: BillingWorker,
  month: string,
  monthlyFee: number,
): MonthlyBillingRow {
  const { from, to } = monthRange(month);
  const monthDays = daysInMonth(from);
  const permit = worker.residence_permit_date ?? "";
  const left = worker.leaving_on ?? "";
  const leftThisMonth = Boolean(left && left >= from && left <= to);

  // その月に支援が始まったか（更新で許可が下りただけの人は日割りしない）
  const permitThisMonth = Boolean(permit && permit >= from && permit <= to);
  const startedBefore = Boolean(
    worker.employment_start_on && worker.employment_start_on < from,
  );
  const newlyStarted = permitThisMonth && !startedBefore;

  const periodFrom = newlyStarted ? permit : from;
  const periodTo = leftThisMonth ? left : to;

  let kind: BillingKind = "満額";
  if (newlyStarted) kind = "許可日から日割";
  else if (leftThisMonth) kind = "退職日まで日割";
  else if (permitThisMonth) kind = "満額（更新月）";

  const days = dayNumber(periodTo) - dayNumber(periodFrom) + 1;
  // 日割りでも月まるごと（月初許可〜未退職など）は満額にする
  const full = kind === "満額" || kind === "満額（更新月）" || days === monthDays;
  const amount = monthlyFee <= 0 ? 0 : full ? monthlyFee : dailyFee(monthlyFee, monthDays) * days;

  return {
    worker,
    monthlyFee,
    periodFrom,
    periodTo,
    days: full ? monthDays : days,
    monthDays,
    kind,
    amount,
    leftThisMonth,
  };
}

// YYYY-MM-DD の日にち部分
function dayNumber(dateStr: string): number {
  return Number(dateStr.slice(8, 10)) || 0;
}

// 所属機関に登録されている支援代（月額）。未登録・数値にならない場合は0
export function orgMonthlyFee(org: BillingOrg | undefined): number {
  if (!org) return 0;
  return parseAmount(org.intake?.support_fee ?? "") ?? 0;
}

// その月の請求書作成用の集計を組み立てる
export function summarizeMonthlyBilling(
  workers: BillingWorker[],
  organizations: BillingOrg[],
  month: string,
): MonthlyBilling {
  const { to } = monthRange(month);
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const byOrg = new Map<string, MonthlyBillingOrg>();
  const unpriced: MonthlyBillingRow[] = [];

  for (const worker of workers) {
    if (!isBilledInMonth(worker, month)) continue;
    const orgId = worker.current_organization_id ?? "";
    const org = orgById.get(orgId);
    const row = billingRowFor(worker, month, orgMonthlyFee(org));
    if (row.monthlyFee <= 0) unpriced.push(row);

    if (!byOrg.has(orgId)) {
      byOrg.set(orgId, {
        organizationId: orgId,
        organizationName: org?.name ?? "所属機関未設定",
        rows: [],
        total: 0,
        leftCount: 0,
      });
    }
    const bucket = byOrg.get(orgId)!;
    bucket.rows.push(row);
    bucket.total += row.amount;
    if (row.leftThisMonth) bucket.leftCount += 1;
  }

  const orgs = [...byOrg.values()].sort((a, b) =>
    a.organizationName.localeCompare(b.organizationName, "ja"),
  );
  // 機関の中は氏名順（エクセルの在籍名簿と同じ並び）
  for (const o of orgs) o.rows.sort((a, b) => a.worker.name.localeCompare(b.worker.name, "ja"));

  return {
    month,
    monthEndOn: to,
    orgs,
    totalPeople: orgs.reduce((sum, o) => sum + o.rows.length, 0),
    totalLeft: orgs.reduce((sum, o) => sum + o.leftCount, 0),
    totalAmount: orgs.reduce((sum, o) => sum + o.total, 0),
    unpriced,
  };
}

// 「2026-07-01〜2026-07-31」（エクセルの支援費算定期間の表記）
export function periodText(row: MonthlyBillingRow): string {
  return `${row.periodFrom}〜${row.periodTo}`;
}

// 「24/31」（エクセルの日数の表記）
export function daysText(row: MonthlyBillingRow): string {
  return `${row.days}/${row.monthDays}`;
}

// 所属機関をまたいだ1行（当月許可者・当月退職者のリスト用）
export interface CrossOrgBillingRow {
  org: MonthlyBillingOrg;
  row: MonthlyBillingRow;
}

function crossOrgRows(billing: MonthlyBilling): CrossOrgBillingRow[] {
  return billing.orgs.flatMap((org) => org.rows.map((row) => ({ org, row })));
}

// 当月に在留許可が下りた人（新規・更新の両方。見分けは区分 row.kind）。許可日の古い順
export function permittedThisMonthRows(billing: MonthlyBilling): CrossOrgBillingRow[] {
  return crossOrgRows(billing)
    .filter(({ row }) => (row.worker.residence_permit_date ?? "").startsWith(billing.month))
    .sort((a, b) => {
      const d = (a.row.worker.residence_permit_date ?? "").localeCompare(
        b.row.worker.residence_permit_date ?? "",
      );
      return d !== 0 ? d : a.row.worker.name.localeCompare(b.row.worker.name, "ja");
    });
}

// 当月に退職した人（退職日まで日割りで請求している人）。退職日の古い順
export function leftThisMonthRows(billing: MonthlyBilling): CrossOrgBillingRow[] {
  return crossOrgRows(billing)
    .filter(({ row }) => row.leftThisMonth)
    .sort((a, b) => {
      const d = (a.row.worker.leaving_on ?? "").localeCompare(b.row.worker.leaving_on ?? "");
      return d !== 0 ? d : a.row.worker.name.localeCompare(b.row.worker.name, "ja");
    });
}
