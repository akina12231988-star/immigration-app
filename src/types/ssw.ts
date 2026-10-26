// docs/03_database_design.md §3〜4 に対応する型定義（外国人・職歴・通算計算用）

export const VISA_TYPES = [
  "本国での職歴",
  "技能実習",
  "特定技能1号",
  "特定技能2号",
  "特定活動（特定技能1号移行準備）",
  "特定活動（特定技能2号移行準備）",
  "特定活動（コロナ帰国困難）", // 新型コロナで帰国できなかった期間（通算5年にはカウントしない）
  "留学",
  "無職", // 転職活動中など働いていなかった期間（勤務先なし。0200_visa_type_unemployed.sql）
  "その他",
] as const;

export type VisaType = (typeof VISA_TYPES)[number];

// 無職（働いていなかった期間）。勤務先・都道府県は持たない。
// 特定技能1号を保持したまま無職だった期間は kept_residence_status で通算に含められる
export const UNEMPLOYED_VISA: VisaType = "無職";

// 会社に在籍していた職歴か（本国での職歴・無職は、会社の在籍期間として扱わない）
export function isEmploymentHistory(visa: VisaType | string): boolean {
  return visa !== "本国での職歴" && visa !== UNEMPLOYED_VISA;
}

// 通算5年（60か月）のカウント対象となる区分。
// 特定技能1号移行準備のための特定活動期間は通算在留期間に算入される（入管運用）。
export const COUNTED_VISAS: ReadonlySet<VisaType> = new Set<VisaType>([
  "特定技能1号",
  "特定活動（特定技能1号移行準備）",
]);

// 帰国期間の在留資格の扱いを選択できる区分（本国での職歴・その他）と、無職の期間。
// 特定技能1号を保持したまま帰国（または無職）していた場合は通算にカウントし、
// 在留資格を切って帰国した場合はカウントしない。
export const KEEPABLE_VISAS: ReadonlySet<VisaType> = new Set<VisaType>([
  "本国での職歴",
  "その他",
  "無職",
]);

// この期間を通算5年にカウントするか（対象の在留資格、または在留資格を保持したままの帰国・無職の期間）
export function isCountedHistory(
  h: Pick<WorkHistory, "visa"> & { keptResidence?: boolean },
): boolean {
  return COUNTED_VISAS.has(h.visa) || (KEEPABLE_VISAS.has(h.visa) && !!h.keptResidence);
}

export interface WorkHistory {
  id: string;
  visa: VisaType;
  start: string; // YYYY-MM-DD
  end: string | null; // null = 継続中
  org: string; // 勤務先・受入機関
  role: string; // 職種・仕事内容
  note: string; // 指定書No.・月収など
  keptResidence?: boolean; // 在留資格（特定技能1号）を保持したまま帰国した期間か
}

// 在留資格が特定技能2号か（在留カードの「在留資格」の文字で見る）。
// 2号には1号の通算5年の上限がないので、画面では1号の通算とは別のバッジを出す。
// 「特定活動（特定技能2号移行準備）」はまだ2号ではないので含めない
export function isSsw2Residence(residenceStatus: string | null | undefined): boolean {
  const s = (residenceStatus ?? "").normalize("NFKC");
  if (s.includes("移行準備")) return false;
  return s.includes("特定技能2号");
}

export type SswStatus = "1号期間未登録" | "5年到達" | "1号在留中" | "中断中";
