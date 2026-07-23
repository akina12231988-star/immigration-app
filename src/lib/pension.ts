// 年金記録票（被保険者記録照会回答票）の記号と、その意味・対応区分。
// 通知書に記載の記号を選び、未納があれば「支払い/免除申請が必要」とアラートする。
// ※ 標準的な国民年金の記号にもとづく。表記が実際の通知書と異なる場合は調整する。

export type PensionAction = "pay" | "exempt" | "ok" | "check";

export interface PensionSymbol {
  code: string; // 記号（表示・保存に使う短いコード）
  meaning: string;
  action: PensionAction;
}

export const PENSION_SYMBOLS: PensionSymbol[] = [
  { code: "納", meaning: "納付済み", action: "ok" },
  { code: "未", meaning: "未納", action: "pay" },
  { code: "全免", meaning: "全額免除", action: "exempt" },
  { code: "3/4免", meaning: "4分の3免除", action: "exempt" },
  { code: "半免", meaning: "半額免除（4分の2免除）", action: "exempt" },
  { code: "1/4免", meaning: "4分の1免除", action: "exempt" },
  { code: "学特", meaning: "学生納付特例", action: "exempt" },
  { code: "猶予", meaning: "納付猶予", action: "exempt" },
  { code: "産", meaning: "産前産後期間の免除", action: "ok" },
  { code: "厚", meaning: "厚生年金（第2号被保険者）", action: "ok" },
  { code: "3号", meaning: "第3号被保険者（扶養）", action: "ok" },
  { code: "未加入", meaning: "未加入期間", action: "check" },
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
      alert: "未加入期間があります。内容を確認してください。",
      needsAction: false,
    };
  }
  return { judgment: "ok", alert: "問題ありません（納付済み等）。", needsAction: false };
}
