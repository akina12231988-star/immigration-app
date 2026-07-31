// 登録支援機関への申込書（organizations.intake jsonb）の初期値と正規化。
// DBの既定値は '{}' のため、欠けているキーを補完して画面で安全に扱えるようにする。

import type {
  OrgFinancialYear,
  OrgJapaneseStaff,
  OrgLodging,
  OrgOfficer,
  OrganizationIntake,
} from "@/types/db";

// 決算情報の初期行数（年月の経過に合わせて行は追加できる）
export const FINANCIAL_DEFAULT_ROWS = 3;

export function emptyFinancialYear(): OrgFinancialYear {
  return {
    year: "",
    term: "",
    period_from: "",
    period_to: "",
    sales: "",
    ordinary: "",
    net: "",
    assets: "",
  };
}

export function emptyJapaneseStaff(): OrgJapaneseStaff {
  return { name: "", role: "", profile: "", pay: "" };
}

export function emptyOfficer(): OrgOfficer {
  return { kana: "", name: "", title: "", not_involved: false };
}

// 寮・宿泊物件の空行。id は添付ファイルとの紐付けに使うため呼び出し側で採番する
// （normalize が毎回同じ結果を返せるよう、この関数内では乱数を使わない）
export function emptyLodging(id: string): OrgLodging {
  return {
    id,
    name: "",
    address: "",
    kind: "",
    total_cost: "",
    equipment_cost: "",
    useful_years: "",
    rent: "",
    max_residents: "",
  };
}

// 賃貸契約書の添付ファイル種別。1件目は旧データとの互換のため従来の「賃貸契約書」を使う
export function lodgingContractKind(lodging: OrgLodging): string {
  return lodging.id === "lodging-1" ? "賃貸契約書" : `賃貸契約書:${lodging.id}`;
}

export function emptyOrganizationIntake(): OrganizationIntake {
  return {
    kana: "",
    phone: "",
    fax: "",
    email: "",
    report_staff: "",
    staff_primary: "",
    staff_secondary: "",
    fiscal_kind: "",
    support_fee: "",
    posting_note: "",
    contact_method: "",
    health_insurance: "",
    pension: "",
    ssw_insurance_burden: "",
    work_address: "",
    work_contact: "",
    rep_kana: "",
    rep_name: "",
    capital: "",
    fiscal_month: "",
    staff_japanese: "",
    staff_trainee: "",
    staff_ssw1: "",
    staff_ssw2: "",
    staff_katsudo: "",
    staff_updated_on: "",
    financials: Array.from({ length: FINANCIAL_DEFAULT_ROWS }, () => emptyFinancialYear()),
    wage_parity_reason: "",
    rosai_covered: "",
    rosai_no: "",
    koyo_covered: "",
    koyo_no: "",
    lodgings: [emptyLodging("lodging-1")],
    first_hired_on: "",
    missing_ssw: "",
    missing_trainee: "",
    council_note: "",
    japanese_staff: [emptyJapaneseStaff()],
    officers: [emptyOfficer()],
  };
}

// 主担当・副担当の表示（例: 市原　彩奈（主）・田上　夏季（副））。未設定なら ''
export function orgStaffLabel(intake: Partial<OrganizationIntake> | null | undefined): string {
  const primary = intake?.staff_primary?.trim() ?? "";
  const secondary = intake?.staff_secondary?.trim() ?? "";
  return [primary && `${primary}（主）`, secondary && `${secondary}（副）`]
    .filter(Boolean)
    .join("・");
}

// この機関の担当者か（主担当・副担当のどちらかに一致するか）
export function isOrgStaff(
  intake: Partial<OrganizationIntake> | null | undefined,
  name: string,
): boolean {
  if (!name) return false;
  return intake?.staff_primary === name || intake?.staff_secondary === name;
}

// 保存済みの intake（欠けたキーや古い形があり得る）を完全な形に補完する
export function normalizeOrganizationIntake(raw: unknown): OrganizationIntake {
  const base = emptyOrganizationIntake();
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<OrganizationIntake>;

  // 決算情報は保存済みの行数を維持する（行の追加に対応）。無ければ初期行数分の空行
  const finSrc = Array.isArray(src.financials) ? src.financials : [];
  const financials =
    finSrc.length > 0
      ? finSrc.map((row) => ({ ...emptyFinancialYear(), ...row }))
      : base.financials;

  const staffSrc = Array.isArray(src.japanese_staff) ? src.japanese_staff : [];
  const japanese_staff =
    staffSrc.length > 0 ? staffSrc.map((s) => ({ ...emptyJapaneseStaff(), ...s })) : base.japanese_staff;

  const officerSrc = Array.isArray(src.officers) ? src.officers : [];
  const officers =
    officerSrc.length > 0 ? officerSrc.map((o) => ({ ...emptyOfficer(), ...o })) : base.officers;

  // 寮・宿泊物件。旧形式（フラットな lodging_* 項目）は1件目として移行する。
  // id が無い行には決め打ちの id を振る（保存すると固定される）
  const legacy = src as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const lodSrc = Array.isArray(src.lodgings) ? src.lodgings : [];
  const lodgings: OrgLodging[] =
    lodSrc.length > 0
      ? lodSrc.map((row, i) => ({ ...emptyLodging(`lodging-${i + 1}`), ...row }))
      : [
          {
            ...emptyLodging("lodging-1"),
            address: s(legacy.lodging_address),
            kind: s(legacy.lodging_kind),
            total_cost: s(legacy.lodging_total_cost),
            equipment_cost: s(legacy.lodging_equipment_cost),
            useful_years: s(legacy.lodging_useful_years),
            rent: s(legacy.lodging_rent),
            max_residents: s(legacy.lodging_max_residents),
          },
        ];

  const merged: OrganizationIntake & Record<string, unknown> = {
    ...base,
    ...src,
    financials,
    japanese_staff,
    officers,
    lodgings,
  };
  // 旧フラット項目は保存し直したときに残らないよう取り除く
  for (const key of [
    "lodging_address",
    "lodging_kind",
    "lodging_total_cost",
    "lodging_equipment_cost",
    "lodging_useful_years",
    "lodging_rent",
    "lodging_max_residents",
  ]) {
    delete merged[key];
  }
  return merged;
}

// ---- 宿泊物件の費用計算 ----

// 金額・数値の文字列から数値を取り出す（カンマ・円・全角数字などを許容）。数値にならなければ null
export function parseAmount(s: string): number | null {
  const half = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const cleaned = half.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 自己所有物件の1ヶ月分の家賃代 = （かかった総費用＋備品代）÷（耐用年数×12） 円未満四捨五入
export function ownedMonthlyRent(
  totalCost: string,
  equipmentCost: string,
  usefulYears: string,
): number | null {
  const total = parseAmount(totalCost);
  const equipment = parseAmount(equipmentCost) ?? 0;
  const years = parseAmount(usefulYears);
  if (total == null || years == null) return null;
  return Math.round((total + equipment) / (years * 12));
}

// 1人あたりの居住費用 = 家賃（月額）÷ 最大入居人数 円未満四捨五入
export function perResidentCost(rent: string, maxResidents: string): number | null {
  const r = parseAmount(rent);
  const n = parseAmount(maxResidents);
  if (r == null || n == null) return null;
  return Math.round(r / n);
}

// 金額の表示（例: 25,000円）
export function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}
