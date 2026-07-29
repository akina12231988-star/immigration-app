// 登録支援機関への申込書（organizations.intake jsonb）の初期値と正規化。
// DBの既定値は '{}' のため、欠けているキーを補完して画面で安全に扱えるようにする。

import type {
  OrgFinancialYear,
  OrgJapaneseStaff,
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

export function emptyOrganizationIntake(): OrganizationIntake {
  return {
    kana: "",
    phone: "",
    fax: "",
    email: "",
    fiscal_kind: "",
    support_fee: "",
    posting_note: "",
    contact_method: "",
    health_insurance: "",
    pension: "",
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
    lodging_address: "",
    lodging_kind: "",
    lodging_total_cost: "",
    lodging_equipment_cost: "",
    lodging_useful_years: "",
    lodging_rent: "",
    lodging_max_residents: "",
    first_hired_on: "",
    missing_ssw: "",
    missing_trainee: "",
    council_note: "",
    japanese_staff: [emptyJapaneseStaff()],
    officers: [emptyOfficer()],
  };
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

  return { ...base, ...src, financials, japanese_staff, officers };
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
