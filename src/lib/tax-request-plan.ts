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
  requested: boolean; // 課税・納税証明書を請求する
  nhi: boolean; // その年度に国民健康保険に加入していた（国保税の納税証明書も請求する）
  nhiMuni: Municipality | null; // 国保税の納税証明書の請求先
}

export type { NhiYearRequest, YearRequest };

// 自治体ごとのまとめ（この自治体に何年度の何を請求するか）
export interface MuniGroup {
  muni: Municipality;
  docs: JudgmentDoc[];
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
  groups: MuniGroup[]; // 自治体ごと（最初に出てきた順）
  docs: JudgmentDoc[]; // 全自治体の書類（groups を平らにしたもの）
}

export function buildTaxRequestPlan(params: { appDate: Date; years: YearPlanInput[] }): TaxRequestPlan {
  const fy = planFiscalYears(params.appDate);
  const years: YearRequest[] = [];
  const nhiYears: NhiYearRequest[] = [];
  const groups: MuniGroup[] = [];
  const groupOf = (muni: Municipality): MuniGroup => {
    let g = groups.find((x) => x.muni.id === muni.id);
    if (!g) {
      g = { muni, docs: [] };
      groups.push(g);
    }
    return g;
  };
  // 最新年度 → 前年度の順に並べる
  const ordered = [...params.years].sort((a, b) => (a.yearType === b.yearType ? 0 : a.yearType === "new" ? -1 : 1));
  for (const y of ordered) {
    const fiscal = fy[y.yearType];
    if (y.requested) {
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
      });
      const g = groupOf(y.muni);
      const at = { municipalityId: y.muni.id, municipalityName: y.muni.name };
      g.docs.push({ title: taxCertTitle(y.muni, fiscal), meta: certMeta(y.muni), starred: y.muni.show_asterisk, ...at });
      g.docs.push({
        title: taxPaymentTitle(y.muni, fiscal),
        meta: y.muni.needs_tax_payment_cert ? "課税証明書とは別途取得が必要です" : "課税証明書とは別に1枚請求します",
        starred: y.muni.show_asterisk,
        ...at,
      });
    }
  }
  for (const y of ordered) {
    if (!y.nhi || !y.nhiMuni) continue;
    const fiscal = fy[y.yearType];
    nhiYears.push({
      yearType: y.yearType,
      fiscalStartYear: fiscal,
      municipalityId: y.nhiMuni.id,
      municipalityName: y.nhiMuni.name,
    });
    groupOf(y.nhiMuni).docs.push({
      title: nhiCertTitle(y.nhiMuni, fiscal),
      meta: `${yearLabelOf(y.yearType)}に国民健康保険に加入していたため必要です`,
      starred: false,
      isNhi: true,
      municipalityId: y.nhiMuni.id,
      municipalityName: y.nhiMuni.name,
    });
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

// 保存済みの記録の書類を自治体ごとにまとめる（定額小為替の欄を自治体ごとに出すときに使う）
export function recordMuniGroups(docs: JudgmentDoc[] = []): { municipalityId: string; municipalityName: string; titles: string[] }[] {
  const out: { municipalityId: string; municipalityName: string; titles: string[] }[] = [];
  for (const d of docs) {
    const id = d.municipalityId ?? "";
    let g = out.find((x) => x.municipalityId === id);
    if (!g) {
      g = { municipalityId: id, municipalityName: d.municipalityName ?? "", titles: [] };
      out.push(g);
    }
    g.titles.push(d.title);
  }
  return out;
}

// 定額小為替の欄（自治体ごと）の group 名
export function muniMoneyOrderGroup(municipalityId: string): `muni:${string}` {
  return `muni:${municipalityId}`;
}

// 手順式フォームで保存した記録か（年度ごとの請求 yearRequests を持つ）
export function hasYearRequests(r: { yearRequests?: unknown }): boolean {
  return Array.isArray(r.yearRequests);
}
