import type { ResignationKind } from "@/types/db";

// 特定技能所属機関の随時届出（法務省: nyuukokukanri10_00002.html）で
// 退職時に作成する参考様式。会社都合は3点セット、自己都合は3-1-2号のみ。
export const FORM_312 = "参考様式第3-1-2号";
export const FORM_34 = "参考様式第3-4号";
export const FORM_511 = "参考様式第5-11号";

export const FORM_TITLES: Record<string, string> = {
  [FORM_312]: "特定技能雇用契約に係る届出書（契約を終了した又は新たに締結した場合）",
  [FORM_34]: "受入れ困難に係る届出書",
  [FORM_511]: "受入れ困難となるに至った経緯に係る説明書",
};

// 退職区分から作成する様式の一覧を返す
export function formsForKind(kind: ResignationKind): string[] {
  return kind === "会社都合" ? [FORM_312, FORM_34, FORM_511] : [FORM_312];
}

// 委託契約をしていた登録支援機関の情報（毎回同じ内容を転記する）。
// 初期値はここで設定し、作成画面で変更した内容はブラウザに保存して次回も使う。
export interface SupportOrgInfo {
  regNo: string; // 登録番号
  name: string; // 機関の氏名または名称
  address: string; // 機関の住所
}

export const SUPPORT_ORG_DEFAULT: SupportOrgInfo = {
  regNo: "２０登-005746",
  name: "VUONG VAN THANH",
  address: "〒861-8045　熊本県熊本市東区小山3-8-87 カームリーハウスB201",
};

const SUPPORT_ORG_KEY = "resignation-support-org";

// useSyncExternalStore 用の小さなストア（SSRでは既定値、クライアントで保存値を返す）
let supportOrgCache: SupportOrgInfo | null = null;
const supportOrgListeners = new Set<() => void>();

function loadSupportOrg(): SupportOrgInfo {
  try {
    const raw = window.localStorage.getItem(SUPPORT_ORG_KEY);
    if (!raw) return SUPPORT_ORG_DEFAULT;
    return { ...SUPPORT_ORG_DEFAULT, ...(JSON.parse(raw) as Partial<SupportOrgInfo>) };
  } catch {
    return SUPPORT_ORG_DEFAULT;
  }
}

export function getSupportOrgSnapshot(): SupportOrgInfo {
  if (supportOrgCache === null) supportOrgCache = loadSupportOrg();
  return supportOrgCache;
}

export function getSupportOrgServerSnapshot(): SupportOrgInfo {
  return SUPPORT_ORG_DEFAULT;
}

export function subscribeSupportOrg(listener: () => void): () => void {
  supportOrgListeners.add(listener);
  return () => supportOrgListeners.delete(listener);
}

export function saveSupportOrg(info: SupportOrgInfo): void {
  supportOrgCache = info;
  try {
    window.localStorage.setItem(SUPPORT_ORG_KEY, JSON.stringify(info));
  } catch {
    // プライベートブラウズ等で保存できなくても画面上の値はそのまま使える
  }
  supportOrgListeners.forEach((l) => l());
}

// 和暦を使わず「YYYY年M月D日」で表示（様式の記入欄に合わせる）
export function jpDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
