// 郵送請求 ＞ 課税証明書と納税証明書（手順式の請求フォーム）の判定。
// 住所 → 年度ごとの自治体 → 年度ごとの徴収区分 → 申請予定日 → 年度ごとの国保加入 の順に入力し、
// 「どの自治体に何年度の何を請求するか」を自治体ごとにまとめる。UI・保存先に依存しない純粋関数。

import {
  judgeTiming,
  judgeYear,
  latestFiscalStartYear,
  yearWithReiwa,
  type CollectionType,
  type JudgmentDoc,
  type Municipality,
  type NhiYearRequest,
  type YearRequest,
  type YearType,
} from "@/lib/tax-cert";

// 年度ごとの入力
export interface YearPlanInput {
  yearType: YearType; // new = 最新年度 / prev = 前年度
  muni: Municipality; // その年度の1月1日時点の住所地
  collectionType: CollectionType; // その年度の徴収区分
  taxCert: boolean; // 課税証明書を請求する
  taxPayment: boolean; // 市県民税の納税証明書を請求する
  nhi: boolean; // その年度に国民健康保険に加入していた（国保税の納税証明書も請求する）
  nhiMuni: Municipality | null; // 国保税の納税証明書の請求先
}

export type { NhiYearRequest, YearRequest };

// 年度ごとのまとめ（その年度に何をどこへ請求するか）。
// 定額小為替・郵送請求した書類の添付も年度ごとに分ける
export interface YearGroup {
  yearType: YearType;
  fiscalStartYear: number;
  muni: Municipality; // 課税・納税証明書の請求先（その年度の1月1日時点の住所地）
  docs: JudgmentDoc[]; // 課税証明書・市県民税納税証明書・国保税の納税証明書（国保は請求先が違うことがある）
}

export function yearLabelOf(yearType: YearType): string {
  return yearType === "new" ? "最新年度" : "前年度";
}

// 申請予定日の時点の最新年度・前年度（西暦の開始年）
export function planFiscalYears(appDate: Date): { new: number; prev: number } {
  const latest = latestFiscalStartYear(appDate);
  return { new: latest, prev: latest - 1 };
}

// 最新年度の徴収区分と自治体の設定から、どちらの年度の証明書で足りるかの目安。
// 特別徴収は翌年5月まで最新年度の納付が続くので前年度、普通徴収は1〜5月なら最新年度、
// 最新年度の自治体が「＊」表示なら常に最新年度
export function suggestRequestedYears(params: {
  newMuni: Municipality;
  newCollection: CollectionType;
  appDate: Date;
}): { new: boolean; prev: boolean; reason: string } {
  const y = judgeYear(params.newMuni.show_asterisk, params.newCollection, params.appDate);
  return { new: y.yearType === "new", prev: y.yearType === "prev", reason: y.reason };
}

// 証明書の題名（自治体名つき。定額小為替の「どの証明書の分か」にもこの題名を使う）
export function taxCertTitle(muni: Municipality, fiscalStartYear: number): string {
  return `${muni.name}：${muni.cert_name}（${yearWithReiwa(fiscalStartYear)}）`;
}

export function taxPaymentTitle(muni: Municipality, fiscalStartYear: number): string {
  return `${muni.name}：市県民税納税証明書（${yearWithReiwa(fiscalStartYear)}）`;
}

export function nhiCertTitle(muni: Municipality, fiscalStartYear: number): string {
  return `${muni.name}：国民健康保険税 納税証明書（${yearWithReiwa(fiscalStartYear)}）`;
}

function certMeta(muni: Municipality): string {
  const parts: string[] = [];
  if (muni.has_income) parts.push("所得額の記載あり");
  if (muni.has_tax) parts.push("課税額の記載あり");
  return parts.length > 0 ? parts.join(" / ") : "所得額・課税額の記載設定なし（要確認）";
}

export interface TaxRequestPlan {
  years: YearRequest[];
  nhiYears: NhiYearRequest[];
  groups: YearGroup[]; // 年度ごと（最新年度 → 前年度。請求する書類が無い年度は除く）
  docs: JudgmentDoc[]; // 全年度の書類（groups を平らにしたもの）
}

export function buildTaxRequestPlan(params: { appDate: Date; years: YearPlanInput[] }): TaxRequestPlan {
  const fy = planFiscalYears(params.appDate);
  const years: YearRequest[] = [];
  const nhiYears: NhiYearRequest[] = [];
  const groups: YearGroup[] = [];
  // 最新年度 → 前年度の順に並べる
  const ordered = [...params.years].sort((a, b) => (a.yearType === b.yearType ? 0 : a.yearType === "new" ? -1 : 1));
  for (const y of ordered) {
    const fiscal = fy[y.yearType];
    const docs: JudgmentDoc[] = [];
    const at = { municipalityId: y.muni.id, municipalityName: y.muni.name, yearType: y.yearType };
    if (y.taxCert || y.taxPayment) {
      const timing = judgeTiming(y.collectionType, y.yearType, params.appDate);
      years.push({
        yearType: y.yearType,
        fiscalStartYear: fiscal,
        municipalityId: y.muni.id,
        municipalityName: y.muni.name,
        collectionType: y.collectionType,
        timingStatus: timing.status,
        timingLabel: timing.label,
        timingDetail: timing.detail,
        taxCert: y.taxCert,
        taxPayment: y.taxPayment,
      });
      if (y.taxCert) {
        docs.push({ title: taxCertTitle(y.muni, fiscal), meta: certMeta(y.muni), starred: y.muni.show_asterisk, ...at });
      }
      if (y.taxPayment) {
        docs.push({
          title: taxPaymentTitle(y.muni, fiscal),
          meta: y.muni.needs_tax_payment_cert ? "課税証明書とは別途取得が必要です" : "課税証明書とは別に1枚請求します",
          starred: y.muni.show_asterisk,
          ...at,
        });
      }
    }
    if (y.nhi && y.nhiMuni) {
      nhiYears.push({
        yearType: y.yearType,
        fiscalStartYear: fiscal,
        municipalityId: y.nhiMuni.id,
        municipalityName: y.nhiMuni.name,
      });
      docs.push({
        title: nhiCertTitle(y.nhiMuni, fiscal),
        meta:
          y.nhiMuni.id === y.muni.id
            ? `${yearLabelOf(y.yearType)}に国民健康保険に加入していたため必要です`
            : `${yearLabelOf(y.yearType)}に国民健康保険に加入していたため必要です。課税証明書とは別の自治体（${y.nhiMuni.name}）に請求します`,
        starred: false,
        isNhi: true,
        municipalityId: y.nhiMuni.id,
        municipalityName: y.nhiMuni.name,
        yearType: y.yearType,
      });
    }
    if (docs.length > 0) groups.push({ yearType: y.yearType, fiscalStartYear: fiscal, muni: y.muni, docs });
  }
  return { years, nhiYears, groups, docs: groups.flatMap((g) => g.docs) };
}

// 「判定する」が押せない理由
export function taxPlanBlockers(p: {
  newMuni: Municipality | null;
  prevMuni: Municipality | null;
  appDate: string;
  years: { yearType: YearType; nhi: boolean; nhiMuni: Municipality | null }[];
}): string[] {
  const out: string[] = [];
  if (!p.newMuni) out.push("最新年度の自治体を選んでください");
  if (!p.prevMuni) out.push("前年度の自治体を選んでください");
  if (!p.appDate) out.push("申請予定日を入力してください");
  for (const y of p.years) {
    if (y.nhi && !y.nhiMuni) out.push(`${yearLabelOf(y.yearType)}の国保税の納税証明書の請求先を選んでください`);
  }
  return out;
}

// 定額小為替の欄（年度ごと）の group 名
export function yearMoneyOrderGroup(yearType: YearType): `year:${YearType}` {
  return `year:${yearType}`;
}

// 保存済みの記録の書類を、定額小為替の欄ごとにまとめる。
// 年度ごとに保存した記録は年度ごと、それ以前（自治体ごと）の記録は自治体ごと
export function recordMoneyOrderGroups(
  docs: JudgmentDoc[] = [],
): { group: `year:${YearType}` | `muni:${string}`; label: string; titles: string[] }[] {
  const byYear = docs.some((d) => d.yearType);
  const out: { group: `year:${YearType}` | `muni:${string}`; label: string; titles: string[] }[] = [];
  for (const d of docs) {
    const group = byYear && d.yearType ? yearMoneyOrderGroup(d.yearType) : (`muni:${d.municipalityId ?? ""}` as const);
    const label = byYear && d.yearType ? yearLabelOf(d.yearType) : d.municipalityName || "自治体";
    let g = out.find((x) => x.group === group);
    if (!g) {
      g = { group, label, titles: [] };
      out.push(g);
    }
    g.titles.push(d.title);
  }
  return out;
}

// 手順式フォームで保存した記録か（年度ごとの請求 yearRequests を持つ）
export function hasYearRequests(r: { yearRequests?: unknown }): boolean {
  return Array.isArray(r.yearRequests);
}
