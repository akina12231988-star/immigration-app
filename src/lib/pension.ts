// 年金記録票（被保険者記録照会回答票）の記号と、その意味・対応区分。
// 通知書に記載の記号を選び、未納があれば「支払い/免除申請が必要」とアラートする。
// ※ 標準的な国民年金の記号にもとづく。表記が実際の通知書と異なる場合は調整する。

export type PensionAction = "pay" | "exempt" | "ok" | "check";

export interface PensionSymbol {
  code: string; // 記号（表示・保存に使う短いコード）
  meaning: string;
  action: PensionAction;
}

// 通知書（被保険者記録照会回答票）に記載の記号。実際の通知書の記号に合わせる。
// ＊=未納 / A=納付済み は確認済み。他の記号（B ほか・免除/猶予/厚生/第3号 等）は
// 通知書の凡例に合わせて随時追加する。
export const PENSION_SYMBOLS: PensionSymbol[] = [
  { code: "A", meaning: "納付済み", action: "ok" },
  { code: "＊", meaning: "未納", action: "pay" },
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
