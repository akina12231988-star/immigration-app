// 年金記録票（被保険者記録照会回答票「納付記録」）の記号と、その意味・対応区分。
//
// 記号の一覧は日本年金機構の「国民年金納付記録の見方」の凡例そのまま。
// 記録票は 年度（4月〜翌3月）× 各月 のマス目に、1か月ごとに1文字の記号が並ぶ。
// 申請では「申請月の2か月前までの24か月分」を見るため、月ごとに記号を控えて判定する。

export type PensionAction = "pay" | "exempt" | "ok" | "check";

export interface PensionSymbol {
  code: string; // 記号（記録票に印字される1文字）
  meaning: string; // 凡例の「内容」
  action: PensionAction; // 申請にあたっての対応区分
}

// 対応区分の表示名。記号を選んだときに、その場で何をすればいいか分かるようにする
export const PENSION_ACTION_LABELS: Record<PensionAction, string> = {
  pay: "要支払い/免除申請",
  exempt: "免除・猶予",
  ok: "問題なし",
  check: "要確認",
};

// 記録票の凡例（「国民年金納付記録の見方」）。並びは対応区分ごと。
//
// action の付け方:
//   pay    … 保険料が納まっていない月。支払うか、免除・猶予を申請する必要がある
//   exempt … 免除・猶予・特例で処理済みの月（未納ではない）
//   ok     … 納付済み（前納・充当・追納を含む）
//   check  … 国民年金の対象外の月・記録の切替待ちなど、中身を見ないと判断できない月
export const PENSION_SYMBOLS: PensionSymbol[] = [
  // ---- 未納（要支払い/免除申請） ----
  { code: "*", meaning: "未納", action: "pay" },
  { code: "X", meaning: "定額＋付加分未納", action: "pay" },
  { code: "-", meaning: "第3号未納（保険料納付済期間に算入しない月）", action: "pay" },
  { code: "&", meaning: "特定期間未納", action: "pay" },
  { code: "ア", meaning: "半額未納", action: "pay" },
  { code: "チ", meaning: "4分の3免除期間にかかる未納", action: "pay" },
  { code: "ヒ", meaning: "4分の1免除期間にかかる未納", action: "pay" },

  // ---- 免除・猶予・特例（未納ではない） ----
  { code: "D", meaning: "産前産後免除", action: "exempt" },
  { code: "E", meaning: "産前産後免除＋付加保険料", action: "exempt" },
  { code: "F", meaning: "産前産後免除＋付加保険料（充当）", action: "exempt" },
  { code: "L", meaning: "中国残留邦人等の特例措置にかかる免除", action: "exempt" },
  { code: "R", meaning: "みなし免除（沖縄特別措置）", action: "exempt" },
  { code: "Y", meaning: "法定免除", action: "exempt" },
  { code: "Z", meaning: "申請免除（全額）", action: "exempt" },
  { code: "サ", meaning: "学生納付特例", action: "exempt" },
  { code: "セ", meaning: "納付猶予", action: "exempt" },

  // ---- 納付済み（定額・前納・充当） ----
  { code: "A", meaning: "定額保険料", action: "ok" },
  { code: "B", meaning: "定額保険料＋付加保険料", action: "ok" },
  { code: "C", meaning: "定額保険料＋付加分未納（定額は納付済み）", action: "ok" },
  { code: "G", meaning: "定額保険料（前納）＋付加保険料", action: "ok" },
  { code: "P", meaning: "定額保険料（前納）", action: "ok" },
  { code: "Q", meaning: "定額保険料（前納）＋付加保険料（前納）", action: "ok" },
  { code: "V", meaning: "定額保険料（充当）", action: "ok" },
  { code: "W", meaning: "定額保険料（充当）＋付加保険料（充当）", action: "ok" },

  // ---- 納付済み（追納・特例納付・第3号） ----
  { code: "T", meaning: "追納保険料", action: "ok" },
  { code: "U", meaning: "追納加算保険料", action: "ok" },
  { code: "H", meaning: "中国残留邦人等の特例措置にかかる追納保険料", action: "ok" },
  { code: "K", meaning: "特例納付", action: "ok" },
  { code: "M", meaning: "特例納付", action: "ok" },
  { code: "+", meaning: "第3号納付（保険料納付済期間に算入する月）", action: "ok" },
  { code: "$", meaning: "第3号特例納付", action: "ok" },

  // ---- 納付済み（半額免除期間） ----
  { code: "イ", meaning: "半額納付", action: "ok" },
  { code: "ウ", meaning: "半額前納", action: "ok" },
  { code: "エ", meaning: "半額分充当", action: "ok" },
  { code: "オ", meaning: "半額納付済の追納", action: "ok" },
  { code: "カ", meaning: "半額納付済の追納＋追納加算保険料", action: "ok" },
  { code: "キ", meaning: "半額前納済の追納", action: "ok" },
  { code: "ク", meaning: "半額前納済の追納＋追納加算保険料", action: "ok" },
  { code: "ケ", meaning: "半額充当済の追納", action: "ok" },
  { code: "コ", meaning: "半額充当済の追納＋追納加算保険料", action: "ok" },

  // ---- 納付済み（学生納付特例・納付猶予の追納） ----
  { code: "シ", meaning: "学生納付特例追納", action: "ok" },
  { code: "ス", meaning: "学生納付特例追納＋追納加算保険料", action: "ok" },
  { code: "ソ", meaning: "納付猶予追納", action: "ok" },
  { code: "タ", meaning: "納付猶予追納＋追納加算保険料", action: "ok" },

  // ---- 納付済み（4分の3免除期間） ----
  { code: "ツ", meaning: "4分の3免除期間にかかる納付", action: "ok" },
  { code: "テ", meaning: "4分の3免除期間にかかる前納", action: "ok" },
  { code: "ト", meaning: "4分の3免除期間にかかる充当", action: "ok" },
  { code: "マ", meaning: "4分の3免除期間納付済にかかる追納", action: "ok" },
  { code: "ミ", meaning: "4分の3免除期間納付済にかかる追納＋追納加算保険料", action: "ok" },
  { code: "ム", meaning: "4分の3免除期間前納済にかかる追納", action: "ok" },
  { code: "メ", meaning: "4分の3免除期間前納済にかかる追納＋追納加算保険料", action: "ok" },
  { code: "モ", meaning: "4分の3免除期間充当済にかかる追納", action: "ok" },
  { code: "ヤ", meaning: "4分の3免除期間充当済にかかる追納＋追納加算保険料", action: "ok" },

  // ---- 納付済み（4分の1免除期間） ----
  { code: "フ", meaning: "4分の1免除期間にかかる納付", action: "ok" },
  { code: "ヘ", meaning: "4分の1免除期間にかかる前納", action: "ok" },
  { code: "ホ", meaning: "4分の1免除期間にかかる充当", action: "ok" },
  { code: "ナ", meaning: "4分の1免除期間納付済にかかる追納", action: "ok" },
  { code: "ニ", meaning: "4分の1免除期間納付済にかかる追納＋追納加算保険料", action: "ok" },
  { code: "ヌ", meaning: "4分の1免除期間前納済にかかる追納", action: "ok" },
  { code: "ネ", meaning: "4分の1免除期間前納済にかかる追納＋追納加算保険料", action: "ok" },
  { code: "ノ", meaning: "4分の1免除期間充当済にかかる追納", action: "ok" },
  { code: "ハ", meaning: "4分の1免除期間充当済にかかる追納＋追納加算保険料", action: "ok" },

  // ---- 要確認 ----
  { code: "/", meaning: "無資格（20歳前・60歳以降・厚生年金期間 等）", action: "check" },
  { code: "#", meaning: "納付記録未切替", action: "check" },
];

// 記号を全角で控えていることがあるため、半角にそろえてから引く。
// 「￥」は以前の版で納付済みの意味で使っていたので、A（定額保険料）として扱う。
const CODE_ALIASES: Record<string, string> = {
  "＊": "*",
  "×": "*",
  "－": "-",
  "ー": "-",
  "―": "-",
  "＋": "+",
  "＆": "&",
  "＃": "#",
  "＄": "$",
  "／": "/",
  "￥": "A",
  "Ａ": "A",
};

// 記号1文字を正規化する（全角・小書きカナのゆらぎを吸収）。未知の記号は "" を返す
export function normalizePensionCode(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const c = CODE_ALIASES[t] ?? t;
  // 英字は大文字に、それ以外はそのまま
  const upper = c.length === 1 ? c.toUpperCase() : c;
  return pensionSymbolByCode(upper) ? upper : "";
}

export function pensionSymbolByCode(code: string): PensionSymbol | undefined {
  return PENSION_SYMBOLS.find((s) => s.code === code);
}

export function parsePensionSymbols(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => normalizePensionCode(s))
    .filter((s) => !!s);
}

// ---- 申請で見る24か月分（申請月の2か月前まで） ----

// 申請では「申請月の2か月前」までの納付状況を見る。その月を最後に24か月さかのぼる。
// 直前の1か月は記録票にまだ反映されないため、2か月前が最新になる。
export const PENSION_MONTH_COUNT = 24;
// 申請月から何か月前までを見るか
export const PENSION_MONTH_LAG = 2;

// "YYYY-MM" に n か月足す（n が負なら戻る）
export function addMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (!y || !m) return "";
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

// 申請月（"YYYY-MM"）から、確認する24か月分の年月を古い順に返す
export function pensionMonths(
  applyMonth: string,
  count: number = PENSION_MONTH_COUNT,
): string[] {
  const newest = addMonth(applyMonth, -PENSION_MONTH_LAG);
  if (!newest) return [];
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(addMonth(newest, -i));
  return months;
}

// "2026-06" → "令和8年6月"（記録票は和暦なので、照らし合わせやすいように添える）
export function warekiMonthLabel(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (!y || !m) return "";
  if (y >= 2019) return `令和${y - 2018}年${m}月`;
  if (y >= 1989) return `平成${y - 1988}年${m}月`;
  return `昭和${y - 1925}年${m}月`;
}

// 月ごとの記号（キーは "YYYY-MM"）。未入力の月はキーを持たない
export type PensionMonthCodes = Record<string, string>;

// 保存されている月ごとの記号を、既知の記号だけに絞って読み込む
export function parseMonthCodes(value: unknown): PensionMonthCodes {
  if (!value || typeof value !== "object") return {};
  const out: PensionMonthCodes = {};
  for (const [month, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const code = typeof raw === "string" ? normalizePensionCode(raw) : "";
    if (code) out[month] = code;
  }
  return out;
}

// まとめて貼り付けた記号の並びを、月ごとに割り当てる。
// 記録票は「AAA AAA A／A ／／／」のように1文字ずつ並ぶので、区切りは何でもよい。
// 並びは古い月から順に当てる（足りない・多い分は切り捨て）。
export function assignPastedCodes(pasted: string, months: string[]): PensionMonthCodes {
  const codes = [...pasted]
    .map((ch) => normalizePensionCode(ch))
    .filter((c) => !!c);
  const out: PensionMonthCodes = {};
  months.forEach((month, i) => {
    if (codes[i]) out[month] = codes[i];
  });
  return out;
}

export type PensionJudgment = "pay" | "exempt" | "check" | "ok" | "none";

export interface PensionResult {
  judgment: PensionJudgment;
  alert: string; // 表示するメッセージ
  needsAction: boolean; // 支払い/免除申請が必要か
}

// 選ばれた記号から総合判定を返す。未納があれば最優先で「支払い/免除申請が必要」。
export function judgePension(codes: string[]): PensionResult {
  const known = codes.map((c) => pensionSymbolByCode(c)).filter((s) => !!s);
  const actions = new Set(known.map((s) => s!.action));
  if (!known.length) {
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
      alert: "免除・猶予・学生特例で対応済みです（未納ではありません）。",
      needsAction: false,
    };
  }
  if (actions.has("check")) {
    return {
      judgment: "check",
      alert: "国民年金の対象外・記録未切替の月があります。内容を確認してください。",
      needsAction: false,
    };
  }
  return { judgment: "ok", alert: "問題ありません（納付済み等）。", needsAction: false };
}

export interface PensionMonthSummary {
  filled: number; // 記号が入っている月数
  total: number; // 確認する月数
  payMonths: string[]; // 未納の月（"YYYY-MM"）
}

// 24か月分の入力状況をまとめる（未納の月をそのまま画面に出せるように）
export function summarizeMonths(
  codes: PensionMonthCodes,
  months: string[],
): PensionMonthSummary {
  const payMonths = months.filter((m) => pensionSymbolByCode(codes[m] ?? "")?.action === "pay");
  return {
    filled: months.filter((m) => !!codes[m]).length,
    total: months.length,
    payMonths,
  };
}
