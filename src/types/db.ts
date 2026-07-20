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

export const WORKER_STATUSES = ["支援中", "在籍中", "求職活動中", "帰国", "退職"] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

// 在留更新の対応状況（空文字＝未対応・対象）
export const RESIDENCE_RENEWAL_STATUSES = [
  "",
  "準備中",
  "審査中",
  "転職先にて対応中",
  "帰国",
] as const;
export type ResidenceRenewalStatus = (typeof RESIDENCE_RENEWAL_STATUSES)[number];

export interface Organization {
  id: string;
  name: string;
  industry: string;
  business_category: string; // 業務区分（特定技能）
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
  passport_no: string; // パスポート番号
  passport_expiry_date: string | null; // パスポート有効期限
  notion_link: string; // Notion 個人ページのリンク
  residence_renewal_status: ResidenceRenewalStatus; // 在留更新の対応状況
  residence_renewal_todo: string; // Notion 申請TODO番号
  leaving_on: string | null; // 退職日
  leaving_todo: string; // 退職時のNotion申請TODO番号
  gender: string; // 性別
  employment_start_on: string | null; // 雇用開始年月日
  assigned_office: string; // 配属先営業所
  residence_note: string; // 居住先（社宅・自分のアパート など）
  photo_path: string | null; // 顔写真（worker-files バケット）
  messenger_link: string; // Messenger グループ/個人リンク
  specialty_grade: string; // 専門級の合格名
  other_qualifications: string; // その他の資格・合格名
  note: string;
  worker_code: string | null; // 外国人ID（例: V-1）。自動採番
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

// フォーム入力（IDや監査列を除いた編集可能フィールド）。worker_code は自動採番のため除外
export type WorkerInput = Omit<
  Worker,
  "id" | "worker_code" | "legacy_id" | "created_by" | "created_at" | "updated_at"
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
  organization_id: string | null;
  name: string;
  application_date: string; // YYYY-MM-DD
  application_no: string;
  content: string;
  status: string; // ApplicationStatus（types/application.ts）
  assignee: string; // 申請取次士
  method: string; // 窓口 / オンライン
  email_link: string;
  line_reported: boolean;
  notion_synced: boolean;
  approved: boolean;
  approval_date: string | null;
  card_received_on: string | null;
  withdrawn_on: string | null;
  approval_reported: boolean;
  receipt_image_url: string | null;
  notice_image_url: string | null;
  residence_card_image_url: string | null;
  residence_expiry_at_apply: string | null; // 申請時点の在留期限
  is_self_apply: boolean; // 本人申請
  receipt_scheduled_on: string | null; // 受取予定日
  receipt_reason: string; // 受取理由
  granted_card_no: string; // 許可時 在留カード番号
  granted_permit_date: string | null; // 在留許可日
  granted_expiry_date: string | null; // 在留期限日
  employment_start_on: string | null; // 雇用開始日
  visa_at_grant: string; // 許可時の在留資格
  report_org_honorific: string; // 御中 / 様
  created_at: string;
  updated_at: string;
}

// ---- 入管メール通知（0025_mail_notifications.sql） ----

// Gmailに届いた入管メールの分類
export const MAIL_CATEGORIES = ["許可", "申請受付", "その他"] as const;
export type MailCategory = (typeof MAIL_CATEGORIES)[number];

export interface MailNotificationRow {
  id: string;
  gmail_message_id: string | null;
  category: string; // MailCategory
  subject: string;
  from_address: string;
  snippet: string;
  body: string;
  received_at: string;
  gmail_link: string;
  matched_worker_id: string | null;
  matched_application_id: string | null;
  matched_name: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

// 生活オリエンテーション（0013 / 0015 / 0016）
export const ORIENTATION_STATUSES = ["未実施", "実施済", "実施不可（早期退職）"] as const;
export type OrientationStatus = (typeof ORIENTATION_STATUSES)[number];

export interface OrientationRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  application_id: string | null;
  scheduled_on: string;
  employment_start_on: string | null;
  status: OrientationStatus;
  done_on: string | null;
  drive_link: string;
  note: string;
  created_at: string;
  updated_at: string;
}

// 在留カード・指定書の履歴（0015）
export interface WorkerDocumentRow {
  id: string;
  worker_id: string;
  kind: "在留カード" | "指定書";
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

// application_files（0009）: 申請画像のメタデータ
export interface ApplicationFileRow {
  id: string;
  application_id: string;
  kind: string; // ApplicationFileKind
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}
