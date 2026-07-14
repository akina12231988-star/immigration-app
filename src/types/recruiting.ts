// 求人・求職・採用（docs/04_recruiting_design.md）

export const POSTING_STATUSES = ["募集中", "充足", "終了"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const WAGE_KINDS = ["時給", "月給", "日給", "年収"] as const;
export type WageKind = (typeof WAGE_KINDS)[number];

export const GENDER_REQS = ["不問", "男性", "女性"] as const;
export type GenderReq = (typeof GENDER_REQS)[number];

export const APPLICATION_RESULTS = ["選考中", "採用", "不採用", "辞退"] as const;
export type ApplicationResult = (typeof APPLICATION_RESULTS)[number];

export interface JobPosting {
  id: string;
  organization_id: string;
  received_on: string;
  valid_until: string | null;
  closed_on: string | null;
  openings: number;
  job_type: string;
  work_location: string;
  employment_period: string;
  wage_kind: WageKind;
  wage_amount: number | null;
  contact: string;
  display_company: string;
  display_address: string;
  target_nationality: string;
  gender: GenderReq;
  hire_timing: string;
  status: PostingStatus;
  note: string;
  created_at: string;
  updated_at: string;
}

export type JobPostingInput = Omit<
  JobPosting,
  "id" | "created_at" | "updated_at"
>;

// 求職管理簿（応募）
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
