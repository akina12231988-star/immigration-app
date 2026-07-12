// docs/03_database_design.md §3〜4 に対応する型定義（外国人・職歴・通算計算用）

export const VISA_TYPES = [
  "本国での職歴",
  "技能実習",
  "特定技能1号",
  "特定技能2号",
  "特定活動（特定技能1号移行準備）",
  "特定活動（特定技能2号移行準備）",
  "留学",
  "その他",
] as const;

export type VisaType = (typeof VISA_TYPES)[number];

// 通算5年（60か月）のカウント対象となる区分。
// 特定技能1号移行準備のための特定活動期間は通算在留期間に算入される（入管運用）。
export const COUNTED_VISAS: ReadonlySet<VisaType> = new Set<VisaType>([
  "特定技能1号",
  "特定活動（特定技能1号移行準備）",
]);

export interface WorkHistory {
  id: string;
  visa: VisaType;
  start: string; // YYYY-MM-DD
  end: string | null; // null = 継続中
  org: string; // 勤務先・受入機関
  role: string; // 職種・仕事内容
  note: string; // 指定書No.・月収など
}

export type SswStatus = "1号期間未登録" | "5年到達" | "1号在留中" | "中断中";
