// 特定技能 支援計画書の日付計算。
// もとにしているのは、いつも使っている「特定技能 日付計算ツール」（HTML版）。
// 雇用開始日を基準に、雇用条件書の作成日・雇用契約日・支援委託契約・書類作成日・
// 事前ガイダンス・生活オリエンテーション・署名日を同じルールで計算する。
// 日付はすべて YYYY-MM-DD の文字列で扱う（文字列比較で大小が判定できる）。

export interface PlanDateInput {
  employStart: string; // 雇用開始日（必須）
  applyDate?: string | null; // 申請予定日（入管。任意）
  contractDate?: string | null; // 雇用契約日（任意。無ければ雇用開始日の14日前と推定）
  docDate?: string | null; // 書類作成日（任意。無ければ申請予定日の1日前／雇用開始日の3日前と推定）
  healthDate?: string | null; // 健康診断の受診日（任意。署名日の基準になる）
  isLegal: boolean; // 所属機関が法人か（雇用終了日: 法人=2年 / 個人=1年）
}

export interface PlanDates {
  cond: string; // 雇用条件書の作成日（雇用契約日の前日）
  con: string; // 雇用契約日
  conEstimated: boolean; // 推定か（未入力で雇用開始日の14日前を使った）
  scEnd: string; // 支援委託契約の終了日（雇用契約日から5年）
  doc: string; // 書類作成日（支援計画書）
  docEstimated: boolean;
  es: string; // 雇用開始日
  eeEnd: string; // 雇用終了日（法人2年 / 個人1年）
  eeYears: number;
  guid: string; // 事前ガイダンス実施日（雇用契約日〜書類作成日の中間）
  orient: string; // 生活オリエンテーション実施日（雇用開始から2週間後）
  sign: string; // 署名日
  signBasis: "health" | "mid" | "nextday"; // 署名日の決め方
  errors: string[];
}

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const toYmd = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysYmd(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

export function addYearsYmd(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return toYmd(d);
}

// 2つの日付の中間の日（ツールと同じく、ミリ秒の中間の日付）
export function midYmd(a: string, b: string): string {
  return toYmd(new Date(Math.round((toDate(a).getTime() + toDate(b).getTime()) / 2)));
}

export function computePlanDates(input: PlanDateInput): PlanDates {
  const es = input.employStart;
  const ap = (input.applyDate ?? "").trim() || null;
  const ci = (input.contractDate ?? "").trim() || null;
  const di = (input.docDate ?? "").trim() || null;
  const hi = (input.healthDate ?? "").trim() || null;

  const con = ci ?? addDaysYmd(es, -14);
  const doc = di ?? (ap ? addDaysYmd(ap, -1) : addDaysYmd(es, -3));
  const cond = addDaysYmd(con, -1);
  const scEnd = addDaysYmd(addYearsYmd(con, 5), -1);
  const eeYears = input.isLegal ? 2 : 1;
  const eeEnd = addDaysYmd(addYearsYmd(es, eeYears), -1);
  const guid = midYmd(con, doc);
  const orient = addDaysYmd(es, 14);

  // 署名日: 健康診断受診日があれば max(書類作成日, 受診日)。
  // 無ければ書類作成日〜申請予定日の中間（申請予定日が無ければ書類作成日の翌日）
  let sign: string;
  let signBasis: PlanDates["signBasis"];
  if (hi) {
    sign = hi >= doc ? hi : doc;
    signBasis = "health";
  } else if (ap) {
    sign = midYmd(doc, ap);
    signBasis = "mid";
  } else {
    sign = addDaysYmd(doc, 1);
    signBasis = "nextday";
  }

  const errors: string[] = [];
  if (con >= es) errors.push("雇用契約日は雇用開始日より前が必要です");
  if (doc < con || doc > es) errors.push("書類作成日は雇用契約日〜雇用開始日の間が必要です");
  if (ap && ap > es) errors.push("申請予定日が雇用開始日より後です");

  return {
    cond,
    con,
    conEstimated: !ci,
    scEnd,
    doc,
    docEstimated: !di,
    es,
    eeEnd,
    eeYears,
    guid,
    orient,
    sign,
    signBasis,
    errors,
  };
}

// ステップカレンダーの各ステップの推奨日
export function recommendedApplyDate(employStart: string): string {
  return addDaysYmd(employStart, -30); // 雇用開始日の1ヶ月前頃
}
export function recommendedContractDate(applyDate: string | null, employStart: string): string {
  return addDaysYmd(applyDate ?? employStart, -7); // 申請予定日（無ければ雇用開始日）の1週間前
}
export function recommendedDocDate(applyDate: string | null, employStart: string): string {
  return applyDate ? addDaysYmd(applyDate, -1) : addDaysYmd(employStart, -3);
}

// 保存する日付一覧の項目（キー → 表示名）。
// 日付計算の「保存」でこの形の Record<string, string> にして support_plan_dates.dates に入れ、
// 申請準備のTODO・日付計算のどちらからでも編集できる
export const PLAN_DATE_FIELDS = [
  { key: "apply", label: "申請予定日（入管）" },
  { key: "cond", label: "雇用条件書の作成日（参考様式1-6号）" },
  { key: "con", label: "雇用契約日（支援委託契約日も同日）" },
  { key: "scEnd", label: "支援委託契約の終了日" },
  { key: "doc", label: "書類作成日（支援計画書）" },
  { key: "es", label: "雇用開始日" },
  { key: "eeEnd", label: "雇用終了日" },
  { key: "guid", label: "事前ガイダンス実施日" },
  { key: "orient", label: "生活オリエンテーション実施日" },
  { key: "sign", label: "署名日" },
] as const;

export type PlanDateKey = (typeof PLAN_DATE_FIELDS)[number]["key"];

// 算出結果 → 保存する日付一覧（未設定の項目は入れない）
export function planDatesToMap(r: PlanDates, applyDate: string | null): Record<string, string> {
  const out: Record<string, string> = {
    cond: r.cond,
    con: r.con,
    scEnd: r.scEnd,
    doc: r.doc,
    es: r.es,
    eeEnd: r.eeEnd,
    guid: r.guid,
    orient: r.orient,
    sign: r.sign,
  };
  if (applyDate) out.apply = applyDate;
  return out;
}

// コピー用テキスト（ツールの「テキストをコピー」と同じ形）
export function planDatesText(
  info: { name: string; org: string; todo: string },
  r: PlanDates,
  applyDate: string | null,
): string {
  const jp = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return `${y}年${m}月${d}日`;
  };
  const lines = ["【特定技能 支援計画書 日付一覧】"];
  if (info.todo) lines.push(`TODO: ${info.todo}`);
  if (info.name) lines.push(`申請人: ${info.name}`);
  if (info.org) lines.push(`所属機関: ${info.org}`);
  lines.push("");
  const entries: [string, string][] = [];
  if (applyDate) entries.push(["申請予定日", applyDate]);
  entries.push(
    ["雇用条件書の作成日（参考様式1-6号）", r.cond],
    ["雇用契約日", r.con],
    ["登録支援機関 支援委託契約日（参考様式1-25号）", r.con],
    ["　（委託契約終了日）", r.scEnd],
    ["書類作成日", r.doc],
    ["雇用開始日", r.es],
    [`雇用終了日（${r.eeYears}年後）`, r.eeEnd],
    ["事前ガイダンス実施日（参考様式1-17号）", r.guid],
    ["生活オリエンテーション実施日（参考様式1-17号）", r.orient],
    ["署名日", r.sign],
  );
  for (const [label, ymd] of entries) lines.push(`${label}：${jp(ymd)}`);
  return lines.join("\n");
}
