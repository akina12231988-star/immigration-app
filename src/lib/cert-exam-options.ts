// 日本語の合格証・専門外の合格証の「受験した試験名」「受験地」の候補。
// Notionの選択肢（外国人詳細）を移行したもの。候補に無い試験名・国名は自由入力できる。

export const NIHONGO_EXAM_NAME_OPTIONS = [
  "日本語能力試験　JLPT",
  "日本語能力試験　JEES",
  "受験してない",
  "Nursing care skills evaluation test(Vietnamese)",
  "Nursing care Japanese language evaluation test (Vietnamese)",
  "General crop farming (Vietnamese)",
  "General livestock farming (Vietnamese)",
  "国際交流基金日本語基礎テスト",
  "公益財団法人　日本国際教育支援協会",
  "技能実習の専門級の合格なので省略",
] as const;

export const SENMONGAI_EXAM_NAME_OPTIONS = [
  "外国人食品産業技能評価機構",
  "General crop farming (Indonesian)",
  "General livestock farming (Khumer)",
  "General crop farming (Khmer)",
  "Nursing care skills evaluation test(Vietnamese)",
  "Nursing care Japanese language evaluation test (Vietnamese)",
  "General livestock farming (Vietnamese)",
  "General crop farming (Vietnamese)",
] as const;

// 受験地: 日本国内 / それ以外（海外の国名を自由入力）
export const EXAM_LOCATION_JAPAN = "日本国内";
