// 支援委託終了の随時報告書（参考様式第３－３－２号
// 「支援委託契約の終了又は締結に係る届出書」）。
//
// いちばん多いのは「特定技能2号へ移行したので支援委託契約が終わる」ケース。
// そのときの決まりごとをここに置く:
//   ・②届出の事由 … 支援委託契約の終了
//   ・Ａa 終了年月日 … 特定技能2号の許可日の前の日
//   ・Ａb 終了の事由 … 大分類「委託契約の期間満了」＋小分類「その他（特定技能２号へ移行した為）」
//   ・①届出の対象者 … 特定技能2号へ移る前（＝特定技能1号のとき）の在留カード番号・分野・業務区分
//
// 他の終わり方（機関の都合・登録支援機関の都合）も選べるようにしてある。

import { addDaysYmd } from "@/lib/support-plan-dates";

// 終了の事由の大分類（様式Ａbの上段）
export interface SupportEndMajorReason {
  code: string;
  label: string;
  cell: string; // チェック欄
}

export const SUPPORT_END_MAJOR_REASONS: SupportEndMajorReason[] = [
  { code: "期間満了", label: "委託契約の期間満了", cell: "M63" },
  { code: "機関都合", label: "特定技能所属機関の都合による終了", cell: "M64" },
  { code: "支援機関都合", label: "登録支援機関の都合による終了", cell: "M65" },
];

// 終了の事由の小分類（様式Ａbの下段）
export interface SupportEndMinorReason {
  code: string;
  label: string;
  cell: string; // チェック欄
  // 記載要領の対応表で、この小分類が使える大分類
  majors: string[];
}

export const SUPPORT_END_MINOR_REASONS: SupportEndMinorReason[] = [
  { code: "期間満了", label: "期間満了", cell: "M67", majors: ["期間満了"] },
  { code: "経営上の都合", label: "経営上の都合", cell: "M68", majors: ["機関都合", "支援機関都合"] },
  { code: "契約違反", label: "契約違反", cell: "M69", majors: ["機関都合", "支援機関都合"] },
  { code: "登録取消し", label: "登録取消し", cell: "M70", majors: ["支援機関都合"] },
  // その他は（　）に全角20文字以内で理由を書く
  { code: "その他", label: "その他（理由を記入）", cell: "M71", majors: [] },
];

// 「その他」の理由を書き込むセル（様式のラベルごと差し替える）
export const SUPPORT_END_OTHER_CELL = "N71";
export const SUPPORT_END_OTHER_CODE = "その他";

// 特定技能2号へ移行したときの既定値
export const SUPPORT_END_DEFAULT_MAJOR = "期間満了";
export const SUPPORT_END_DEFAULT_MINOR = SUPPORT_END_OTHER_CODE;
export const SUPPORT_END_DEFAULT_OTHER_REASON = "特定技能２号へ移行した為";

export function supportEndMajor(code: string): SupportEndMajorReason | undefined {
  return SUPPORT_END_MAJOR_REASONS.find((r) => r.code === code);
}

export function supportEndMinor(code: string): SupportEndMinorReason | undefined {
  return SUPPORT_END_MINOR_REASONS.find((r) => r.code === code);
}

// 支援委託契約の終了年月日 = 特定技能2号の許可日の前の日。
// 許可日が入っていなければ空（届出書はまだ作れない）
export function endDateFromPermitDate(permitDate: string | null | undefined): string {
  if (!permitDate || !/^\d{4}-\d{2}-\d{2}$/.test(permitDate)) return "";
  return addDaysYmd(permitDate, -1);
}

// 「その他」の理由は全角20文字以内（記載要領）。超えていたら知らせる
export const SUPPORT_END_OTHER_MAX = 20;

export function otherReasonTooLong(reason: string): boolean {
  return reason.trim().length > SUPPORT_END_OTHER_MAX;
}
