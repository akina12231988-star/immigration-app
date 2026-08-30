// 登録支援機関への申込書（organizations.intake jsonb）の初期値と正規化。
// DBの既定値は '{}' のため、欠けているキーを補完して画面で安全に扱えるようにする。

import type {
  OrgCouncilSubmission,
  OrgFinancialYear,
  OrgJapaneseStaff,
  OrgLodging,
  OrgOfficer,
  OrgSalesItem,
  OrgSalesItems,
  OrganizationIntake,
} from "@/types/db";
import { orgSupportManagers, orgSupportStaff } from "@/lib/support-system";

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

// 協力確認書の提出1件分（提出先・提出日）
export function emptyCouncilSubmission(): OrgCouncilSubmission {
  return { to: "", on: "" };
}

// 協力確認書の提出リストの正規化（不正な形は空行1件にする）
function normalizeCouncilSubmissions(raw: unknown): OrgCouncilSubmission[] {
  const src = Array.isArray(raw) ? raw : [];
  const rows = src.map((r) => {
    const s = (r && typeof r === "object" ? r : {}) as Partial<OrgCouncilSubmission>;
    return {
      to: typeof s.to === "string" ? s.to : "",
      on: typeof s.on === "string" ? s.on : "",
    };
  });
  return rows.length > 0 ? rows : [emptyCouncilSubmission()];
}

export function emptySalesItem(): OrgSalesItem {
  return { name: "", amount: "" };
}

// 申請種別ごとの売上明細の正規化（不正な形は空として扱う）
export function normalizeSalesItems(raw: unknown): OrgSalesItems {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OrgSalesItems = {};
  for (const [kind, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    out[kind] = rows.map((r) => {
      const src = (r && typeof r === "object" ? r : {}) as Partial<OrgSalesItem>;
      return {
        name: typeof src.name === "string" ? src.name : "",
        amount: typeof src.amount === "string" ? src.amount : "",
      };
    });
  }
  return out;
}

// 寮・宿泊物件の空行。id は添付ファイルとの紐付けに使うため呼び出し側で採番する
// （normalize が毎回同じ結果を返せるよう、この関数内では乱数を使わない）
export function emptyLodging(id: string): OrgLodging {
  return {
    id,
    name: "",
    address: "",
    kind: "",
    purchase_state: "",
    elapsed_years: "",
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
    support_contract_status: "",
    support_managers: [],
    support_staff: [],
    fiscal_kind: "",
    support_fee: "",
    posting_note: "",
    posting_gensen: "",
    posting_utility_cost: "",
    posting_utility_kind: "",
    posting_comm_cost: "",
    posting_comm_reason: "",
    posting_pay_closing: "",
    posting_pay_day: "",
    posting_other_conditions: "",
    posting_monthly_hours: "",
    posting_annual_hours: "",
    flex_hours_kind: "",
    flex_docs_start: "",
    contact_method: "",
    health_insurance: "",
    pension: "",
    pay_method: "",
    ssw_insurance_burden: "",
    sales_items: {},
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
    council_office_submissions: [emptyCouncilSubmission()],
    council_residence_submissions: [emptyCouncilSubmission()],
    japanese_staff: [emptyJapaneseStaff()],
    officers: [emptyOfficer()],
  };
}

// 支援責任者・支援担当者の表示（例: 市原　彩奈（責）・田上　夏季（担））。未設定なら ''。
// 責任者と担当者を兼任している人は「（責・担）」でまとめて1回だけ出す。
export function orgStaffLabel(intake: Partial<OrganizationIntake> | null | undefined): string {
  const managers = orgSupportManagers(intake);
  const staff = orgSupportStaff(intake);
  const parts: string[] = [];
  for (const name of managers) {
    parts.push(staff.includes(name) ? `${name}（責・担）` : `${name}（責）`);
  }
  for (const name of staff) {
    if (!managers.includes(name)) parts.push(`${name}（担）`);
  }
  return parts.join("・");
}

// この機関の支援責任者・支援担当者のいずれかか
export function isOrgStaff(
  intake: Partial<OrganizationIntake> | null | undefined,
  name: string,
): boolean {
  if (!name) return false;
  return orgSupportManagers(intake).includes(name) || orgSupportStaff(intake).includes(name);
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

  // 支援責任者・支援担当者。未移行データ（旧「主担当」「副担当」）は
  // 主担当 → 支援責任者、副担当 → 支援担当者として引き継ぐ
  const merged: OrganizationIntake & Record<string, unknown> = {
    ...base,
    ...src,
    financials,
    japanese_staff,
    officers,
    lodgings,
    sales_items: normalizeSalesItems(src.sales_items),
    council_office_submissions: normalizeCouncilSubmissions(src.council_office_submissions),
    council_residence_submissions: normalizeCouncilSubmissions(src.council_residence_submissions),
    support_managers: orgSupportManagers(src),
    support_staff: orgSupportStaff(src),
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

// 労働時間数の入力を小数の時間に直す。
// 「173時間20分」「173:20」「173.3」「173時間」のどの形でも入力できるようにする。
// 時間と読めなければ null
export function parseHoursMinutes(v: string): number | null {
  const half = v
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .replace(/[．]/g, ".");
  if (!half) return null;
  const hm = half.match(/^(\d+)\s*(?:時間|:)\s*(\d{1,2})\s*分?$/);
  if (hm) {
    const m = Number(hm[2]);
    if (m > 59) return null;
    return Number(hm[1]) + m / 60;
  }
  const hOnly = half.match(/^(\d+(?:\.\d+)?)\s*(?:時間)?$/);
  if (hOnly) return Number(hOnly[1]);
  return null;
}

// 小数の時間の表示（例: 173.3。割り切れないときは小数1桁に丸める）
export function formatHoursDecimal(n: number): string {
  return String(Math.round(n * 10) / 10);
}

// 木造住宅の法定耐用年数（寮はほとんど木造のため、目安の計算に使う。直すこともできる）
export const WOODEN_USEFUL_YEARS = 22;

// 新品/中古から耐用年数の目安を出す（国税庁の中古資産の簡便法・木造住宅22年で計算）。
// 中古: 全部経過→22×20%、一部経過→(22−築年数)＋築年数×20%（いずれも年未満切捨て・最低2年）
export function suggestedUsefulYears(
  purchaseState: string,
  elapsedYears: string,
): number | null {
  if (purchaseState === "新品") return WOODEN_USEFUL_YEARS;
  if (purchaseState !== "中古") return null;
  const elapsed = parseAmount(elapsedYears);
  if (elapsed == null) return null;
  const years =
    elapsed >= WOODEN_USEFUL_YEARS
      ? WOODEN_USEFUL_YEARS * 0.2
      : WOODEN_USEFUL_YEARS - elapsed + elapsed * 0.2;
  return Math.max(2, Math.floor(years));
}

// 1人あたりの家賃（月額）から逆算した「かかった総費用＋備品代」の想定額
// = 1人あたり家賃 × 最大入居人数 × 耐用年数 × 12。
// 「この家賃にするには最低これぐらいの費用がかかった想定になる」と説明するのに使う
export function reverseLodgingCost(
  rentPerPerson: string,
  maxResidents: string,
  usefulYears: string,
): number | null {
  const r = parseAmount(rentPerPerson);
  const n = parseAmount(maxResidents);
  const years = parseAmount(usefulYears);
  if (r == null || n == null || years == null) return null;
  return Math.round(r * n * years * 12);
}

// 変形労働時間制の書類（年間カレンダー・労使協定書）の有効期限。
// 開始日から1年間有効（開始日＋1年−1日）。日付と読めなければ空
export function flexDocsValidUntil(start: string): string {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 変形労働時間制の書類の有効期限のお知らせ。
// 期限の2か月前から「そろそろ切れる」、期限を過ぎたら「期限切れ」を返し、
// 新しい年間カレンダー・労使協定書の作成へ早めに動けるようにする
export function flexDocsAlert(
  start: string,
  today: string,
): { kind: "expired" | "expiring"; until: string } | null {
  const until = flexDocsValidUntil(start);
  if (!until) return null;
  if (until < today) return { kind: "expired", until };
  const m = until.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  // 期限の2か月前の日。この日以降はお知らせを出す
  const from = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 3, Number(m[3])))
    .toISOString()
    .slice(0, 10);
  return today >= from ? { kind: "expiring", until } : null;
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

// 金額入力を数字だけにする（全角数字は半角に。カンマ・「円」・「/人」などは取り除く）。
// 保存する値を数字だけに揃えることで、日割り計算やfreee販売への転記で読み違えが起きないようにする
export function digitsOnly(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");
}
