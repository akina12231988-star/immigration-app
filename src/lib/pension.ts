// 年金記録票（被保険者記録照会回答票）の記号と、その意味・対応区分。
// 通知書に記載の記号を選び、未納があれば「支払い/免除申請が必要」とアラートする。
// ※ 標準的な国民年金の記号にもとづく。表記が実際の通知書と異なる場合は調整する。

export type PensionAction = "pay" | "exempt" | "ok" | "check";

export interface PensionSymbol {
  code: string; // 記号（表示・保存に使う短いコード）
  meaning: string;
  action: PensionAction;
}

// 通知書（被保険者記録照会回答票）に記載の記号。実際の通知書の凡例に合わせる。
export const PENSION_SYMBOLS: PensionSymbol[] = [
  // 納付済み（問題なし）
  { code: "A", meaning: "納付済み", action: "ok" },
  { code: "B", meaning: "納付済み", action: "ok" },
  { code: "H", meaning: "納付済み", action: "ok" },
  { code: "￥", meaning: "納付済み", action: "ok" },
  { code: "イ", meaning: "半額免除期間にかかる納付", action: "ok" },
  { code: "ツ", meaning: "4分の3免除期間にかかる納付", action: "ok" },
  { code: "フ", meaning: "4分の1免除期間にかかる納付", action: "ok" },
  { code: "+", meaning: "第3号納付", action: "ok" },
  // 未納（要支払い/免除申請）
  { code: "＊", meaning: "未納", action: "pay" },
  { code: "ア", meaning: "半額免除期間にかかる未納", action: "pay" },
  { code: "チ", meaning: "4分の3免除期間にかかる未納", action: "pay" },
  { code: "ヒ", meaning: "4分の1免除期間にかかる未納", action: "pay" },
  // 免除・猶予・特例（対応済み）
  { code: "L", meaning: "全額免除", action: "exempt" },
  { code: "R", meaning: "全額免除", action: "exempt" },
  { code: "Y", meaning: "全額免除", action: "exempt" },
  { code: "Z", meaning: "全額免除", action: "exempt" },
  { code: "サ", meaning: "学生納付特例", action: "exempt" },
  { code: "セ", meaning: "納付猶予", action: "exempt" },
  // 要確認
  { code: "-", meaning: "時効により保険料が納付できなくなった期間", action: "check" },
  { code: "/", meaning: "国民年金に加入していない期間", action: "check" },
];

export function pensionSymbolByCode(code: string): PensionSymbol | undefined {
  return PENSION_SYMBOLS.find((s) => s.code === code);
}

export function parsePensionSymbols(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => !!pensionSymbolByCode(s));
}

export type PensionJudgment = "pay" | "exempt" | "check" | "ok" | "none";

export interface PensionResult {
  judgment: PensionJudgment;
  alert: string; // 表示するメッセージ
  needsAction: boolean; // 支払い/免除申請が必要か
}

// 選ばれた記号から総合判定を返す。未納があれば最優先で「支払い/免除申請が必要」。
export function judgePension(codes: string[]): PensionResult {
  const actions = new Set(codes.map((c) => pensionSymbolByCode(c)?.action).filter(Boolean));
  if (codes.length === 0) {
    return { judgment: "none", alert: "記号が未入力です。", needsAction: false };
  }
  if (actions.has("pay")) {
    return {
      judgment: "pay",
      alert: "未納があります。支払い または 免除申請が必要です。",
      needsAction: true,
    };
  }
  if (actions.has("exempt")) {
    return {
      judgment: "exempt",
      alert: "免除・猶予・学生特例で対応済みです（追納で満額に近づけられます）。",
      needsAction: false,
    };
  }
  if (actions.has("check")) {
    return {
      judgment: "check",
      alert: "時効未納・未加入などの期間があります。内容を確認してください。",
      needsAction: false,
    };
  }
  return { judgment: "ok", alert: "問題ありません（納付済み等）。", needsAction: false };
}
