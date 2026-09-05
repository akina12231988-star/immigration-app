// 在籍していた時（過去の在籍期間）の在留カード情報。
//
// 過去に在籍していた会社の個人票を、当時の内容で発行するために使う。
// workers には「今の値」しか無いので、当時の内容は次の順番で決める:
//   1. 在籍期間ごとに手で入れて保存した内容（worker_period_cards）
//   2. 申請一覧に残っている、その時点で最後に許可された内容
//      （許可時の在留カード番号・在留資格・許可日・在留期限）
//   3. 雇用開始日・退職日は在籍期間の日付
// 今の値は使わない（最新の在留カードの内容が混ざると、当時の個人票にならないため）。

import type { OrgPeriod } from "@/lib/worker-doc-periods";

// 在籍期間のキー（開始日_終了日）。職歴を足しても番号がずれないよう日付で作る
export function periodCardKey(period: { start: string; end: string }): string {
  return `${period.start}_${period.end}`;
}

// 保存する当時の内容（すべて任意。空欄なら今の値で印刷する）
export interface PeriodCardInput {
  residence_card_no: string;
  residence_status: string;
  residence_permit_date: string | null;
  residence_expiry_date: string | null;
  employment_start_on: string | null;
  leaving_on: string | null;
  note: string;
}

export const EMPTY_PERIOD_CARD: PeriodCardInput = {
  residence_card_no: "",
  residence_status: "",
  residence_permit_date: null,
  residence_expiry_date: null,
  employment_start_on: null,
  leaving_on: null,
  note: "",
};

// 入力欄の並び（画面で使う）
export const PERIOD_CARD_FIELDS = [
  { key: "residence_card_no", label: "在留カード番号", date: false },
  { key: "residence_status", label: "在留資格", date: false },
  { key: "residence_permit_date", label: "許可日", date: true },
  { key: "residence_expiry_date", label: "在留期限", date: true },
  { key: "employment_start_on", label: "雇用開始日", date: true },
  { key: "leaving_on", label: "退職日", date: true },
] as const;

// 印刷する個人票の内容（当時の値。空欄は今の値、日付は在籍期間の日付で埋める）
export interface PeriodCardValues {
  orgName: string;
  residenceCardNo: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
  employmentStartOn: string | null;
  leavingOn: string | null;
}

// 申請一覧に残っている「許可されたときの内容」（immigration_applications の許可欄）
export interface GrantRecord {
  granted_card_no: string;
  granted_permit_date: string | null;
  granted_expiry_date: string | null;
  visa_at_grant: string;
  approval_date: string | null;
}

// その日の時点で最後に許可された内容（＝当時の最終版の在留カード）
export interface GrantValues {
  residenceCardNo: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
}

// 許可日として使う日付（在留許可日、無ければ許可日）
function permitDateOf(a: GrantRecord): string {
  return a.granted_permit_date || a.approval_date || "";
}

// 指定した日（退職日など）の時点で最後に許可された内容を返す。
// その日までに許可が1つも無ければ null（当時の内容が分からないので空欄で出す）
export function grantAsOf(apps: GrantRecord[], onDate: string): GrantValues | null {
  const rows = apps
    .filter((a) => {
      const d = permitDateOf(a);
      return d !== "" && (!onDate || d <= onDate);
    })
    .sort((a, b) => permitDateOf(a).localeCompare(permitDateOf(b)));
  const last = rows[rows.length - 1];
  if (!last) return null;
  return {
    residenceCardNo: last.granted_card_no ?? "",
    residenceStatus: last.visa_at_grant ?? "",
    residencePermitDate: permitDateOf(last) || null,
    residenceExpiryDate: last.granted_expiry_date,
  };
}

// その在籍期間の個人票に出す値を決める。
// 手で入れた当時の内容 → 当時の最終版の許可内容 → 在籍期間の日付 の順に使う。
// どれも無い項目は空欄（今の在留カードの内容は使わない）
export function periodCardValues(
  period: OrgPeriod,
  saved: PeriodCardInput | null,
  grant: GrantValues | null,
): PeriodCardValues {
  return {
    orgName: period.org,
    residenceCardNo: saved?.residence_card_no || grant?.residenceCardNo || "",
    residenceStatus: saved?.residence_status || grant?.residenceStatus || "",
    residencePermitDate: saved?.residence_permit_date || grant?.residencePermitDate || null,
    residenceExpiryDate: saved?.residence_expiry_date || grant?.residenceExpiryDate || null,
    employmentStartOn: saved?.employment_start_on || period.start,
    leavingOn: saved?.leaving_on || period.end,
  };
}

// 当時の内容がまだ1つも入っていないか（画面で「未入力」の案内を出すのに使う）
export function isPeriodCardEmpty(saved: PeriodCardInput | null): boolean {
  if (!saved) return true;
  return PERIOD_CARD_FIELDS.every((f) => !saved[f.key]);
}
