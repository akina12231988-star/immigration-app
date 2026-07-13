// Supabase のテーブル行に対応する型（docs/03_database_design.md）。
// スキーマ確定後は `supabase gen types typescript` による自動生成へ置き換える。

import type { VisaType } from "@/types/ssw";

export type StaffRole = "admin" | "staff" | "viewer";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "管理者",
  staff: "一般職員",
  viewer: "閲覧のみ",
};

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---- 外国人・職歴・所属機関（0003_core.sql） ----

export const SUPPORT_SCOPES = ["支援対象", "支援対象外"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export const WORKER_STATUSES = ["支援中", "求職活動中", "帰国", "退職"] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export interface Organization {
  id: string;
  name: string;
  industry: string;
  address: string;
  contact: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Worker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  birth: string | null; // YYYY-MM-DD
  residence_card_no: string;
  field: string; // 特定産業分野・職種
  support: SupportScope;
  status: WorkerStatus;
  health_note: string;
  family_note: string;
  current_organization_id: string | null;
  residence_status: string; // 現在の在留資格（自由入力）
  residence_permit_date: string | null;
  residence_expiry_date: string | null;
  note: string;
  legacy_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkHistoryRow {
  id: string;
  worker_id: string;
  visa: VisaType;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // null = 継続中
  org_name: string;
  role: string;
  note: string;
  legacy_id: string | null;
  created_at: string;
  updated_at: string;
}

// 一覧・詳細で職歴を同時取得するときの形
export interface WorkerWithHistories extends Worker {
  work_histories: WorkHistoryRow[];
}

// フォーム入力（IDや監査列を除いた編集可能フィールド）
export type WorkerInput = Omit<
  Worker,
  "id" | "legacy_id" | "created_by" | "created_at" | "updated_at"
>;

export type WorkHistoryInput = Omit<
  WorkHistoryRow,
  "id" | "legacy_id" | "created_at" | "updated_at"
>;

export type OrganizationInput = Omit<Organization, "id" | "created_at" | "updated_at">;

// ---- 入管申請（0008_immigration_applications.sql） ----

export interface ImmigrationApplicationRow {
  id: string;
  worker_id: string | null;
  name: string;
  application_date: string; // YYYY-MM-DD
  application_no: string;
  content: string;
  status: string; // ApplicationStatus（types/application.ts）
  assignee: string;
  line_reported: boolean;
  notion_synced: boolean;
  approved: boolean;
  approval_date: string | null;
  receipt_image_url: string | null;
  notice_image_url: string | null;
  residence_card_image_url: string | null;
  created_at: string;
  updated_at: string;
}
