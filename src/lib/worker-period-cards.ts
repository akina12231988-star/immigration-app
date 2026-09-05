// 在籍していた時（過去の在籍期間）の在留カード情報。
//
// 過去に在籍していた会社の個人票を、当時の内容で発行するために使う。
// workers には「今の値」しか無いため、在籍期間ごとに当時の内容を入れて保存し、
// 入っていない項目は今の値で埋める（入力していなくても印刷はできる）。

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

// 今の外国人情報のうち、当時の値が無いときに使うもの
export interface CurrentCardValues {
  residenceCardNo: string;
  residenceStatus: string;
  residencePermitDate: string | null;
  residenceExpiryDate: string | null;
}

// その在籍期間の個人票に出す値を決める。
// 当時の入力 → 在籍期間の日付（雇用開始日・退職日） → 今の値 の順に使う
export function periodCardValues(
  period: OrgPeriod,
  saved: PeriodCardInput | null,
  current: CurrentCardValues,
): PeriodCardValues {
  return {
    orgName: period.org,
    residenceCardNo: saved?.residence_card_no || current.residenceCardNo,
    residenceStatus: saved?.residence_status || current.residenceStatus,
    residencePermitDate: saved?.residence_permit_date || current.residencePermitDate,
    residenceExpiryDate: saved?.residence_expiry_date || current.residenceExpiryDate,
    employmentStartOn: saved?.employment_start_on || period.start,
    leavingOn: saved?.leaving_on || period.end,
  };
}

// 当時の内容がまだ1つも入っていないか（画面で「未入力」の案内を出すのに使う）
export function isPeriodCardEmpty(saved: PeriodCardInput | null): boolean {
  if (!saved) return true;
  return PERIOD_CARD_FIELDS.every((f) => !saved[f.key]);
}
