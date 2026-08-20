// 求人・求職・採用（docs/04_recruiting_design.md）

export const POSTING_STATUSES = ["募集中", "充足", "終了"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const WAGE_KINDS = ["時給", "月給", "日給", "年収"] as const;
export type WageKind = (typeof WAGE_KINDS)[number];

export const GENDER_REQS = ["不問", "男性", "女性"] as const;
export type GenderReq = (typeof GENDER_REQS)[number];

export const APPLICATION_RESULTS = ["選考中", "採用", "不採用", "辞退"] as const;
export type ApplicationResult = (typeof APPLICATION_RESULTS)[number];

// ---- 求人票（特定技能1号）の内容（0090_job_posting_sheet.sql の sheet） ----
//
// 会社に書いてもらう求人票をそのまま入力できるようにするための項目。
// 求人管理簿（受理番号・受付日など）とFacebook掲載用の項目とは別に持つ。

// 特定技能の分野（求人票の「分野名」。求人票の記載に合わせている）
export const POSTING_FIELDS = [
  "介護",
  "ビルクリーニング",
  "素形材・産業機械・電気電子情報関連製造業",
  "建設",
  "造船・舶用工業",
  "自動車整備",
  "航空",
  "宿泊",
  "農業",
  "漁業",
  "飲食料品製造業",
  "外食業",
] as const;

export const POSTING_WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日", "祝祭日"] as const;

// 加入保険（求人票のチェック欄）
export const POSTING_INSURANCES = [
  "健康保険",
  "厚生年金保険",
  "労災保険",
  "雇用保険",
] as const;

// 受動喫煙防止措置の状況（求人票のチェック欄）
export const POSTING_SMOKING_OPTIONS = [
  "屋内禁煙",
  "屋内原則禁煙（喫煙室あり）",
  "敷地内禁煙（喫煙場所あり）",
  "敷地内禁煙（喫煙場所なし）",
  "その他",
] as const;

// 手当の1行（求人票は2行だが、足りないときのために増やせるようにする）
export interface PostingAllowance {
  name: string; // 手当名
  amount: string; // 金額（円）
  method: string; // 計算方法
}

export interface PostingSheet {
  filled_on: string; // 記入日
  field_name: string; // 分野名
  work_location_change: string; // 勤務地の変更の可能性（変更なし / 変更あり: 内容）
  job_description: string; // 仕事内容
  contract_term_kind: string; // 期間の定めなし / 期間の定めあり
  contract_term: string; // 雇用契約期間（期間の定めありの場合）
  contract_renewal: string; // 契約の更新（無 / 有: 条件）
  work_start: string; // 始業
  work_end: string; // 終業
  daily_hours: string; // 1日の所定労働時間
  flexible_hours: string; // 変形労働制（なし / 1か月単位 など）
  break_minutes: string; // 休憩（分）
  overtime: string; // 残業（有 / 無）
  holidays: string[]; // 休日（曜日・祝祭日）
  holiday_note: string; // 休日のその他
  allowances: PostingAllowance[]; // 手当
  income_tax: string; // 源泉所得税（円・扶養0人として）
  social_insurance: string; // 社会保険料（適用 / 適用なし）
  employment_insurance: string; // 雇用保険料（適用 / 適用なし）
  housing_cost: string; // 居住費（円）
  housing_kind: string; // 自己所有物件 / 賃貸物件
  housing_note: string; // 居住費の説明
  utility_cost: string; // 水道光熱費（約◯円）
  utility_kind: string; // 実費 / 固定
  communication_cost: string; // 通信費（約◯円）
  raise: string; // 昇給（有 / 無）
  raise_note: string; // 昇給の支払時期・内容
  bonus: string; // 賞与（有 / 無）
  bonus_note: string; // 賞与の支払時期・内容
  pay_closing_day: string; // 給与の締切日
  pay_day: string; // 給与の支払日
  pay_method: string; // 口座振込 / 通貨払い
  insurances: string[]; // 加入保険
  insurance_other: string; // 加入保険のその他
  smoking: string; // 受動喫煙防止措置の状況
  smoking_note: string; // 受動喫煙防止措置のその他
  experience: string; // 経験の有無
  requirements: string; // 必要条件（N4 など）
  other_requirements: string; // その他
}

export interface JobPosting {
  id: string;
  organization_id: string;
  acceptance_no: string; // 求人受理番号（求人管理簿・様式30。例: 6-1）
  received_on: string;
  valid_until: string | null;
  closed_on: string | null;
  openings: number;
  job_type: string;
  work_location: string;
  employment_period: string;
  wage_kind: WageKind;
  wage_amount: number | null;
  rent: string; // 家賃（掲載用）
  utilities: string; // 光熱費（掲載用）
  contact: string;
  display_company: string;
  display_address: string;
  target_nationality: string;
  gender: GenderReq;
  hire_timing: string;
  status: PostingStatus;
  note: string;
  // 求人票（特定技能1号）の内容。未入力は {}（0090_job_posting_sheet.sql）
  sheet?: Partial<PostingSheet> | null;
  created_at: string;
  updated_at: string;
}

export type JobPostingInput = Omit<
  JobPosting,
  "id" | "created_at" | "updated_at"
>;

// 6か月以内の離職状況（求人管理簿・求職管理簿の無期雇用就職者に関する事項）
export const SEPARATION_STATUSES = ["離職", "離職せず", "不明"] as const;
export type SeparationStatus = (typeof SEPARATION_STATUSES)[number];

// 求職管理簿（応募）。
// 0079の採用後項目（雇用期間・離職状況）は未適用の環境でも動くよう任意にする
export interface JobApplicationRow {
  id: string;
  worker_id: string;
  organization_id: string;
  job_posting_id: string | null;
  applied_on: string;
  interview_on: string | null;
  result_on: string | null;
  result: ApplicationResult;
  note: string;
  employment_term?: string; // 雇用期間（'' / 無期 / 有期）
  separation_status?: string; // 6か月以内の離職状況（'' / 離職 / 離職せず / 不明）
  separation_checked_on?: string | null; // 離職状況の調査日
  separation_check_method?: string; // 調査方法（例: 電話確認）
  created_at: string;
  updated_at: string;
}

export type JobApplicationInput = Omit<
  JobApplicationRow,
  "id" | "created_at" | "updated_at"
>;

// 採用
export interface EmploymentRow {
  id: string;
  worker_id: string;
  organization_id: string;
  job_application_id: string | null;
  hired_on: string;
  job_role: string;
  industry: string;
  left_on: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export type EmploymentInput = Omit<
  EmploymentRow,
  "id" | "created_at" | "updated_at"
>;

// 賃金の表示（例: 時給1,100円）
export function formatWage(kind: WageKind, amount: number | null): string {
  if (amount == null) return "応相談";
  return `${kind}${amount.toLocaleString("ja-JP")}円`;
}
