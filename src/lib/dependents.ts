import type { DependentRemittance, WorkerDependent } from "@/types/db";

// ---- 扶養家族の年齢・和暦・控除区分の判定 ----

// YYYY-MM-DD から today 時点の満年齢を返す。不正な日付は null
export function dependentAge(birth: string, today: string): number | null {
  const b = birth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !t) return null;
  let age = Number(t[1]) - Number(b[1]);
  // 誕生日がまだ来ていなければ1歳引く
  if (`${t[2]}-${t[3]}` < `${b[2]}-${b[3]}`) age -= 1;
  return age >= 0 ? age : null;
}

// YYYY-MM-DD → 和暦の分解（元号1文字・元号年・月・日）。元号外・不正な日付は null。
// 扶養控除等申告書のPDF（元号プルダウン＋年月日欄）への入力に使う
export function warekiParts(
  dateStr: string | null,
): { era: string; eraLong: string; year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ymd = dateStr;
  if (ymd >= "2019-05-01") return { era: "令", eraLong: "令和", year: y - 2018, month: mo, day: d };
  if (ymd >= "1989-01-08") return { era: "平", eraLong: "平成", year: y - 1988, month: mo, day: d };
  if (ymd >= "1926-12-25") return { era: "昭", eraLong: "昭和", year: y - 1925, month: mo, day: d };
  if (ymd >= "1912-07-30") return { era: "大", eraLong: "大正", year: y - 1911, month: mo, day: d };
  return null;
}

// YYYY-MM-DD → 和暦表示（例: 1999-12-12 → 平成11年12月12日）。元号外・不正な日付は ''
export function warekiDate(dateStr: string | null): string {
  const p = warekiParts(dateStr);
  if (!p) return "";
  return `${p.eraLong}${p.year === 1 ? "元" : p.year}年${p.month}月${p.day}日`;
}

// 続柄が配偶者か（配偶者控除の対象）
export function isSpouseRelation(relation: string): boolean {
  return /配偶者|妻|夫/.test(relation);
}

// 扶養家族の該当区分。年齢は today（現時点）から計算する。
// 外国人の扶養親族は国外居住（非居住者）が前提のため、
// 30歳以上70歳未満は「38万円以上の支払（送金）」が扶養控除の要件になる
export interface DependentCategories {
  spouse: boolean; // 配偶者控除
  elderly: boolean; // 老人扶養親族（70歳以上）
  specific: boolean; // 特定扶養親族・特定親族（19歳以上23歳未満）
  youngOrElderly: boolean; // 16歳以上30歳未満又は70歳以上（非居住者でもそのまま控除対象）
  remittanceRequired: boolean; // 38万円以上の支払必要（30歳以上70歳未満の非居住者）
  under16: boolean; // 16歳未満の親族（扶養控除対象外・住民税欄に記載）
}

export function dependentCategories(
  dep: Pick<WorkerDependent, "relation" | "birth">,
  today: string,
): DependentCategories {
  const spouse = isSpouseRelation(dep.relation);
  const age = dependentAge(dep.birth, today);
  const none: DependentCategories = {
    spouse,
    elderly: false,
    specific: false,
    youngOrElderly: false,
    remittanceRequired: false,
    under16: false,
  };
  if (age == null || spouse) return none;
  return {
    spouse: false,
    elderly: age >= 70,
    specific: age >= 19 && age < 23,
    youngOrElderly: (age >= 16 && age < 30) || age >= 70,
    remittanceRequired: age >= 30 && age < 70,
    under16: age < 16,
  };
}

// 区分バッジの表示ラベル（該当するものだけ）
export function dependentCategoryLabels(
  dep: Pick<WorkerDependent, "relation" | "birth">,
  today: string,
): string[] {
  const c = dependentCategories(dep, today);
  const labels: string[] = [];
  if (c.spouse) labels.push("配偶者控除");
  if (c.elderly) labels.push("老人扶養親族");
  if (c.specific) labels.push("特定扶養親族・特定親族");
  if (c.youngOrElderly) labels.push("16歳以上30歳未満又は70歳以上");
  if (c.remittanceRequired) labels.push("38万円以上の支払必要");
  if (c.under16) labels.push("16歳未満の親族");
  return labels;
}

export function emptyDependent(): WorkerDependent {
  return {
    name: "",
    kana: "",
    relation: "",
    birth: "",
    address: "",
    occupation: "",
    my_number: "",
    income: "",
    remittances: [],
  };
}

// 送金1行分の正規化。旧形式（金額だけの文字列）は対象年なしとして引き継ぐ
function normalizeRemittance(v: unknown): DependentRemittance {
  if (typeof v === "string") return { year: "", amount: v };
  const src = (v && typeof v === "object" ? v : {}) as Partial<DependentRemittance>;
  return {
    year: typeof src.year === "string" ? src.year : "",
    amount: typeof src.amount === "string" ? src.amount : "",
  };
}

// 保存済みの dependents（欠けたキーがあり得る）を完全な形に補完する
export function normalizeDependents(raw: unknown): WorkerDependent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => {
    const src = (d && typeof d === "object" ? d : {}) as Partial<WorkerDependent>;
    return {
      ...emptyDependent(),
      ...src,
      remittances: Array.isArray(src.remittances)
        ? src.remittances.map(normalizeRemittance)
        : [],
    };
  });
}

// ---- 年末の国際送金（送金関係書類）の金額集計と目標判定 ----

// 30歳以上70歳未満の非居住者の扶養親族は年38万円以上の送金が必要
export const REMITTANCE_HIGH_TARGET = 380_000;

// 金額文字列を数値にする（カンマ・円・全角数字を許容）。数値にならなければ null
export function parseYen(s: string): number | null {
  const half = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const cleaned = half.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 送金明細の合計額。year を渡すとその対象年の行だけを合計する
export function remittanceTotal(entries: DependentRemittance[], year?: string): number {
  return entries
    .filter((e) => year === undefined || e.year === year)
    .reduce((sum, e) => sum + (parseYen(e.amount) ?? 0), 0);
}

// 記録されている対象年の一覧（新しい年が先。未設定 '' は末尾）
export function remittanceYears(entries: DependentRemittance[]): string[] {
  const years = [...new Set(entries.map((e) => e.year))];
  return years.sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return b.localeCompare(a);
  });
}

// 西暦の年（例: 2026）→ その年の年末調整の和暦表記（例: 令和8年）。
// 元号がまたがる年は年末（12/31）時点の元号で表す（令和元年分など）
export function warekiYear(year: string): string {
  const parts = warekiParts(`${year}-12-31`);
  return parts ? `${parts.eraLong}${parts.year === 1 ? "元" : parts.year}年` : "";
}

// その扶養親族に必要な年間送金額。
// 30歳以上70歳未満は38万円以上、それ以外（配偶者・16歳以上30歳未満・70歳以上・16歳未満）は
// 送金関係書類が必要なため1円以上
export function remittanceTarget(
  dep: Pick<WorkerDependent, "relation" | "birth">,
  today: string,
): number {
  return dependentCategories(dep, today).remittanceRequired ? REMITTANCE_HIGH_TARGET : 1;
}

// その対象年の送金額が目標に達しているか
export function isRemittanceAchieved(
  dep: Pick<WorkerDependent, "relation" | "birth" | "remittances">,
  today: string,
  year: string,
): boolean {
  return remittanceTotal(dep.remittances, year) >= remittanceTarget(dep, today);
}

// 金額の表示（例: 380,000円）
export function formatYenAmount(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}
