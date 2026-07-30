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
