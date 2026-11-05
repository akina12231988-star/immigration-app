// 農業の２号特定技能（全国農業会議所）のアプリケーションNo.の申込で出す2つの書類。
//  ・様式第１号「２号特定技能外国人に求められる実務経験に係る証明書」（所属機関が証明する）
//  ・様式第２号「誓約書」（本人が誓約する）
// テンプレートは public/forms/asat2-shomeisho.docx・asat2-seiyakusho.docx。
// 各記入欄に {{TOKEN}} を仕込んであり、ここで置き換える（外国人雇用状況届出書と同じ方式）。
//
// 氏名・生年月日・国籍は間違えると受け付けてもらえないので、外国人詳細の値をそのまま使い、
// パスポートのMRZ（読み取り済みなら）と食い違いがないかを作成前に確かめる（asatIdentityIssues）。

import { escapeXml } from "@/lib/xlsx-form-fill";
import { parseMrz } from "@/lib/mrz";
import { sumHistoryDays, toYMD } from "@/lib/ssw/calc";

export const ASAT_SHOMEISHO_TEMPLATE = "/forms/asat2-shomeisho.docx";
export const ASAT_SEIYAKUSHO_TEMPLATE = "/forms/asat2-seiyakusho.docx";

export const ASAT_EMPLOYMENT_TYPES = ["直接雇用", "派遣形態"] as const;
export type AsatEmploymentType = (typeof ASAT_EMPLOYMENT_TYPES)[number];
export const ASAT_CATEGORIES = ["耕種農業全般", "畜産農業全般"] as const;
export type AsatCategory = (typeof ASAT_CATEGORIES)[number];

// 証明書・誓約書の対象者（外国人詳細の値）
export interface AsatPerson {
  name: string; // 氏名（パスポートと同じアルファベット）
  birth: string | null; // YYYY-MM-DD
  nationality: string; // 国籍・地域
}

// 就業期間の1行（勤務先ごと）。転職していたときは勤務先ごとに行を分けて書く。
// その勤務先で管理者・監督者等として働いた期間があれば、行の2段目（括弧）に書く
export interface AsatPeriod {
  start: string | null; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD。null は「現在に至る」
  org: string; // 勤務先の名称（3段目に書く）
  mgr: boolean; // この勤務先で管理者・監督者等としての就業期間があるか
  mgrStart: string | null;
  mgrEnd: string | null; // null は「現在に至る」
}

export interface AsatShomeishoData extends AsatPerson {
  certDate: string; // 証明日（YYYY-MM-DD）
  orgName: string; // 実務経験を証明する者（所属機関）の名称
  orgAddress: string;
  orgTel: string;
  orgRep: string; // 代表者（役職・氏名。例: 代表 井上洋介）
  periods: AsatPeriod[]; // 就業期間（勤務先ごと・古い順）
  totalYears: number;
  totalMonths: number;
  // うち管理者・監督者等としての就業期間（無ければ null で空欄）
  mgrYears: number | null;
  mgrMonths: number | null;
  mgrText: string; // 管理者・監督者等としての業務内容（例: 管理者として栽培管理を担当）
  employment: AsatEmploymentType;
  category: AsatCategory;
}

// 職歴から就業期間の行を作る。勤務先（名称）が続けて同じなら1行にまとめる
// （同じ会社で技能実習 → 特定技能1号 のときは「2019年7月14日～現在に至る」の1行になる）。
// 終了日が空（在籍中）か証明日以降なら「現在に至る」
export function asatPeriodsFromHistories(
  histories: { start_date: string; end_date: string | null; org_name: string }[],
  certDate: string,
): AsatPeriod[] {
  const key = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
  const sorted = [...histories].filter((h) => h.start_date).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const out: AsatPeriod[] = [];
  for (const h of sorted) {
    const end = !h.end_date || h.end_date >= certDate ? null : h.end_date;
    const last = out.at(-1);
    if (last && key(last.org) === key(h.org_name) && key(h.org_name)) {
      // 同じ勤務先が続く: 終わりを延ばす（どちらかが在籍中なら現在に至る）
      last.end = last.end === null || end === null ? null : last.end > end ? last.end : end;
      continue;
    }
    out.push({ start: h.start_date, end, org: h.org_name.trim(), mgr: false, mgrStart: null, mgrEnd: null });
  }
  return out;
}

// 就業期間の合計と、うち管理者・監督者等としての合計（年・か月）。在籍中の分は証明日まで数える
export function asatTotals(
  periods: AsatPeriod[],
  certDate: string,
): { years: number; months: number; mgrYears: number | null; mgrMonths: number | null } {
  const total = toYMD(sumHistoryDays(periods.filter((p) => p.start).map((p) => ({ start: p.start ?? "", end: p.end })), certDate));
  const mgrs = periods.filter((p) => p.mgr && p.mgrStart);
  const mgr = mgrs.length > 0 ? toYMD(sumHistoryDays(mgrs.map((p) => ({ start: p.mgrStart ?? "", end: p.mgrEnd })), certDate)) : null;
  return { years: total.y, months: total.m, mgrYears: mgr ? mgr.y : null, mgrMonths: mgr ? mgr.m : null };
}

// YYYY-MM-DD → [年, 月, 日]（先頭の0は付けない）。読めなければ空
export function asatDateParts(date: string | null | undefined): [string, string, string] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m) return ["", "", ""];
  return [String(Number(m[1])), String(Number(m[2])), String(Number(m[3]))];
}

function jpDate(date: string | null | undefined): string {
  const [y, m, d] = asatDateParts(date);
  return y ? `${y}年${m}月${d}日` : "";
}

// 外国人の分野（例: 農業・畜産農業全般）から業務区分の初期値を決める
export function asatCategoryOf(field: string | null | undefined): AsatCategory {
  return (field ?? "").includes("畜産") ? "畜産農業全般" : "耕種農業全般";
}

// 楕円（○）の横位置。テンプレートでは左の選択肢（直接雇用・耕種農業全般）を囲んでいる。
// 右の選択肢は「左の語＋全角空白3つ・・・全角空白3つ」ぶん右にある（11pt の全角1文字 = 11pt）
const PT_EMU = 12700;
const ELLIPSES = {
  employment: { x: 895985, vx: 70.55, shiftChars: 4 + 7 }, // 直接雇用（4文字）＋「　　　・　　　」
  category: { x: 545465, vx: 42.95, shiftChars: 6 + 7 }, // 耕種農業全般（6文字）＋「　　　・　　　」
};
const CHAR_PT = 11;

function ellipsePos(kind: keyof typeof ELLIPSES, right: boolean): { x: string; vx: string } {
  const e = ELLIPSES[kind];
  const shiftPt = right ? e.shiftChars * CHAR_PT : 0;
  return { x: String(e.x + Math.round(shiftPt * PT_EMU)), vx: (e.vx + shiftPt).toFixed(2) };
}

// 管理者・監督者等としての就業期間が無い行の2段目（様式のままの空欄）
// （1行に収まるように様式より少し詰めてある。行が折り返すと転職が多い人で2ページになるため）
const BLANK_MGR_PERIOD = "\u3000\u3000年\u3000\u3000月\u3000\u3000日～\u3000\u3000年\u3000\u3000月\u3000\u3000日";

// 就業期間の1行ぶんの置き換え（この行はテンプレートで勤務先の数だけ複製する）
export function asatPeriodTokens(p: AsatPeriod): Record<string, string> {
  const [sy, sm, sd] = asatDateParts(p.start);
  return {
    "{{SY}}": sy,
    "{{SM}}": sm,
    "{{SD}}": sd,
    "{{END}}": p.end ? jpDate(p.end) : "現在に至る",
    "{{MGR_PERIOD}}":
      p.mgr && p.mgrStart ? `${jpDate(p.mgrStart)}～${p.mgrEnd ? jpDate(p.mgrEnd) : "現在に至る"}` : BLANK_MGR_PERIOD,
    "{{P_ORG}}": p.org,
  };
}

export function asatShomeishoTokens(data: AsatShomeishoData): Record<string, string> {
  const [cy, cm, cd] = asatDateParts(data.certDate);
  const [by, bm, bd] = asatDateParts(data.birth);
  const emp = ellipsePos("employment", data.employment === "派遣形態");
  const cat = ellipsePos("category", data.category === "畜産農業全般");
  return {
    "{{CY}}": cy,
    "{{CM}}": cm,
    "{{CD}}": cd,
    "{{ORG_NAME}}": data.orgName,
    "{{ORG_ADDR}}": data.orgAddress,
    "{{ORG_TEL}}": data.orgTel,
    "{{ORG_REP}}": data.orgRep,
    "{{NAME}}": data.name,
    "{{BY}}": by,
    "{{BM}}": bm,
    "{{BD}}": bd,
    "{{NATIONALITY}}": data.nationality,
    "{{TY}}": String(data.totalYears),
    "{{TM}}": String(data.totalMonths),
    "{{UY}}": data.mgrYears === null ? "" : String(data.mgrYears),
    "{{UM}}": data.mgrMonths === null ? "" : String(data.mgrMonths),
    "{{MGR_TEXT}}": data.mgrText.trim(),
    "{{EMP_X}}": emp.x,
    "{{EMP_VX}}": emp.vx,
    "{{CAT_X}}": cat.x,
    "{{CAT_VX}}": cat.vx,
  };
}

export function asatSeiyakushoTokens(data: AsatPerson): Record<string, string> {
  const [by, bm, bd] = asatDateParts(data.birth);
  return {
    "{{NAME}}": data.name,
    "{{BY}}": by,
    "{{BM}}": bm,
    "{{BD}}": bd,
    "{{NATIONALITY}}": data.nationality,
  };
}

// テンプレート（docx）の {{TOKEN}} を置き換える。置き換え残りがあれば作らない（空欄のまま出さない）。
// rows を渡すと、{{SY}} を含む表の行（就業期間の行）を rows の数だけ複製し、行ごとに置き換える
export async function fillAsatDocx(
  template: ArrayBuffer,
  tokens: Record<string, string>,
  rows?: Record<string, string>[],
): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(template);
  const path = "word/document.xml";
  const file = zip.file(path);
  if (!file) throw new Error("テンプレートの形式が不正です（document.xml がありません）");
  let xml = await file.async("string");
  const fill = (src: string, map: Record<string, string>) => {
    let out = src;
    for (const [token, value] of Object.entries(map)) out = out.split(token).join(escapeXml(value));
    return out;
  };
  if (rows) {
    const at = xml.indexOf("{{SY}}");
    const rowStart = Math.max(xml.lastIndexOf("<w:tr ", at), xml.lastIndexOf("<w:tr>", at));
    const rowEnd = xml.indexOf("</w:tr>", at) + "</w:tr>".length;
    if (at < 0 || rowStart < 0 || rowEnd < "</w:tr>".length) throw new Error("テンプレートに就業期間の行がありません");
    const row = xml.slice(rowStart, rowEnd);
    const filled = (rows.length > 0 ? rows : [{}]).map((r) => fill(row, r)).join("");
    xml = xml.slice(0, rowStart) + filled + xml.slice(rowEnd);
    // 勤務先が2つ以上あると行が増えて2ページ目にはみ出すので、上下の余白（35mm・30mm）を20mmに詰める
    if (rows.length >= 2) {
      xml = xml.replace(/<w:pgMar ([^>]*)\/>/, (_m, attrs: string) =>
        `<w:pgMar ${attrs.replace(/w:top="\d+"/, 'w:top="1134"').replace(/w:bottom="\d+"/, 'w:bottom="1134"')}/>`,
      );
    }
  }
  xml = fill(xml, tokens);
  const left = xml.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error(`テンプレートに入れていない欄があります（${[...new Set(left)].join("・")}）`);
  zip.file(path, xml, { createFolders: false });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ---- 氏名・生年月日・国籍の確認 ----

const normName = (s: string) => s.toUpperCase().replace(/[^A-Z]+/g, " ").trim();

export interface AsatIdentityIssue {
  field: "氏名" | "生年月日" | "国籍";
  level: "error" | "warn";
  message: string;
}

// 書類に書く氏名・生年月日・国籍の確認。
//  error … 空・形がおかしい・パスポート（MRZ）と食い違う（作成させない）
//  warn  … MRZ が未読み取りで照合できない（目で確認してから作る）
export function asatIdentityIssues(person: AsatPerson, passportMrz: string | null | undefined, today: string): AsatIdentityIssue[] {
  const issues: AsatIdentityIssue[] = [];
  const name = person.name.trim();
  if (!name) issues.push({ field: "氏名", level: "error", message: "氏名が未登録です" });
  else if (/[^A-Za-z\s.'-]/.test(name))
    issues.push({ field: "氏名", level: "error", message: "氏名はパスポートと同じアルファベットで登録してください（アルファベット以外の文字が入っています）" });
  if (!asatDateParts(person.birth)[0]) issues.push({ field: "生年月日", level: "error", message: "生年月日が未登録です" });
  if (!person.nationality.trim()) issues.push({ field: "国籍", level: "error", message: "国籍が未登録です" });

  const mrz = (passportMrz ?? "").trim() ? parseMrz(passportMrz ?? "", today) : null;
  if (!mrz || !mrz.ok) {
    issues.push({
      field: "氏名",
      level: "warn",
      message: "パスポートのMRZが未読み取りのため、氏名・生年月日・国籍をパスポートと照合できません。パスポートと見比べて確認してください",
    });
    return issues;
  }
  const mrzName = [mrz.surname, mrz.givenNames].filter(Boolean).join(" ");
  if (name && mrzName && normName(name) !== normName(mrzName)) {
    issues.push({ field: "氏名", level: "error", message: `パスポート（MRZ）の氏名「${mrzName}」と違います` });
  }
  if (person.birth && mrz.birth && mrz.checks.birth && person.birth !== mrz.birth) {
    issues.push({ field: "生年月日", level: "error", message: `パスポート（MRZ）の生年月日「${jpDate(mrz.birth)}」と違います` });
  }
  if (person.nationality.trim() && mrz.nationality && person.nationality.trim() !== mrz.nationality) {
    issues.push({ field: "国籍", level: "error", message: `パスポート（MRZ）の国籍「${mrz.nationality}」と違います` });
  }
  return issues;
}

// 保存するときのファイル名
export function asatFileName(kind: "証明書" | "誓約書", workerName: string): string {
  const safe = (workerName ?? "").replace(/[\\/:*?"<>|]/g, "-").trim();
  const title = kind === "証明書" ? "様式第1号_実務経験に係る証明書" : "様式第2号_誓約書";
  return `${[title, safe].filter(Boolean).join("_")}.docx`;
}
