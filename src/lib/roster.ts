import { categoriesFor } from "@/lib/industries";

// ---- 労働者名簿（worker_rosters）のロジック ----

// 分野名をそのまま使うと不自然になるものの言い換え
const INDUSTRY_BASE: Record<string, string> = {
  宿泊: "宿泊業",
};

// 職種単位の言い換え（アルゴリズムでは不自然になるもの）
const JOB_BASE: Record<string, string> = {
  "漁業／養殖業": "養殖業",
};

// 「分野／職種」から労働者名簿の「業務の種類」欄の記載文を作る。
// 例: 農業／耕種農業全般 → 耕種農業の一般社員（役員なし）
//     建設／土木 → 建設（土木）の一般社員（役員なし）
//     介護（職種が1つの分野） → 介護の一般社員（役員なし）
export function rosterWorkKind(field: string): string {
  const [industry = "", job = ""] = field.split("／");
  if (!industry.trim()) return "";
  const base = workKindBase(industry.trim(), job.trim());
  return `${base}の一般社員（役員なし）`;
}

function workKindBase(industry: string, job: string): string {
  const override = JOB_BASE[`${industry}／${job}`];
  if (override) return override;

  const industryBase = INDUSTRY_BASE[industry] ?? industry;
  if (!job) return industryBase;

  // 「全般」と付記の（）を外す: 飲食料品製造業全般（酒類を除く） → 飲食料品製造業
  const stripped = job.replace(/（[^）]*）/g, "").replace(/全般$/, "").trim();
  if (!stripped || stripped === industry) return industryBase;

  // 職種が1つしかない分野は分野名で言い表せる（例: 介護・ビルクリーニング・自動車整備）
  if (categoriesFor(industry).length <= 1) return industryBase;

  // 「◯◯全般」は職種名がそのまま業務を表す（例: 耕種農業全般 → 耕種農業）
  if (/全般/.test(job)) return stripped;

  // 細分化された区分は「分野（区分）」で表す（例: 建設（土木））
  return `${industryBase}（${stripped}）`;
}

// YYYY-MM-DD → 「1999年12月12日」（それ以外の文字列はそのまま返す）
export function rosterJpDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

// 履歴の年月日文字列を並び替え用のキー（YYYY-MM-DD）にする。
// 「2026年8月1日」「2026-08-01」「2026/8/1」「令和8年8月1日」などを解釈。読めなければ null
export function rosterDateKey(s: string): string | null {
  const pad = (v: string) => v.padStart(2, "0");
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(明治|大正|昭和|平成|令和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日$/);
  if (m) {
    const base = { 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018 }[
      m[1] as "明治" | "大正" | "昭和" | "平成" | "令和"
    ];
    const y = base + (m[2] === "元" ? 1 : Number(m[2]));
    return `${y}-${pad(m[3])}-${pad(m[4])}`;
  }
  return null;
}

// 履歴を年月日の昇順（上から下へ時系列順）に並び替える。
// 日付が読めない行（未入力・自由記述）は順序を保ったまま末尾に置く
export function sortRosterHistory<T extends { on: string }>(rows: T[]): T[] {
  const dated = rows.filter((r) => rosterDateKey(r.on) !== null);
  const undated = rows.filter((r) => rosterDateKey(r.on) === null);
  dated.sort((a, b) =>
    (rosterDateKey(a.on) as string).localeCompare(rosterDateKey(b.on) as string),
  );
  return [...dated, ...undated];
}

// 労働者名簿の保存期間の満了日（労働基準法第109条: 発行から5年間保存）
export function rosterRetentionEnd(issuedOn: string): string {
  const d = new Date(`${issuedOn}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCFullYear(d.getUTCFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

// 保存期間内か（today は YYYY-MM-DD）。発行年月日未設定は期間内扱いにして保護する
export function isWithinRosterRetention(issuedOn: string | null, today: string): boolean {
  if (!issuedOn) return true;
  const end = rosterRetentionEnd(issuedOn);
  return !end || today <= end;
}
