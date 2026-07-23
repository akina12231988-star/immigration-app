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

export const SUPPORT_SCOPES = ["支援開始前", "支援対象", "支援対象外"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

export const WORKER_STATUSES = [
  "申請準備中",
  "支援中",
  "在籍中",
  "求職活動中",
  "帰国",
  "退職",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

// 在留更新の対応状況（空文字＝未対応・対象）
export const RESIDENCE_RENEWAL_STATUSES = [
  "",
  "準備中",
  "審査中",
  "転職先にて対応中",
  "他登録支援機関にて対応中",
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
  corporate_no: string; // 法人番号（13桁・法人でない場合は空）
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
  application_prep_kind: string; // 申請準備の区分（'' = 更新 / '新規' = 新規で申請書類準備）
  leaving_on: string | null; // 退職日
  leaving_todo: string; // 退職時のNotion随時報告TODO番号
  leaving_kind: string; // 退職区分（'' / 会社都合 / 自己都合）
  leaving_reason: string; // 退職理由
  leaving_org_name: string; // 退職した所属機関の名称
  leaving_org_address: string; // 退職した所属機関の住所
  gender: string; // 性別
  address: string; // 住所（履歴書に表示）
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
  kept_residence_status: boolean; // 在留資格（特定技能1号）を保持したまま帰国した期間か
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

// ---- 退職＜随時報告＞（0032_resignations.sql） ----

export const RESIGNATION_KINDS = ["会社都合", "自己都合"] as const;
export type ResignationKind = (typeof RESIGNATION_KINDS)[number];

export interface ResignationRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  org_name: string; // 退職元機関のスナップショット
  org_address: string;
  org_contact: string;
  kind: ResignationKind; // 会社都合 / 自己都合
  reason: string; // 退職理由
  leaving_on: string; // 退職日 YYYY-MM-DD
  todo_no: string; // Notion随時報告TODO番号
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ResignationInput = Omit<
  ResignationRow,
  "id" | "created_by" | "created_at" | "updated_at"
>;

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

// ---- パスポート・在留カード原本の預かり管理（0026_custody.sql） ----

export const CUSTODY_STATUSES = ["ボックス保管中", "持出中", "返却済み"] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];

export const CUSTODY_ACTIONS = ["預かり", "持出", "ボックスへ戻す", "本人へ返却"] as const;
export type CustodyAction = (typeof CUSTODY_ACTIONS)[number];

export const CUSTODY_ITEMS = [
  "パスポート・在留カード",
  "パスポートのみ",
  "在留カードのみ",
] as const;

export interface CustodyRecord {
  id: string;
  worker_id: string;
  storage_no: number; // 保管番号（付箋・預かり証の番号）
  status: CustodyStatus;
  items: string; // 預かっている書類
  received_on: string; // 預かった日
  expire_on: string | null; // 預かり証の有効年月日
  content: string; // 申請内容
  ref_no: string; // 預かり証の整理番号
  holder: string; // 持出中の場合: 今持っている人
  held_since: string | null; // 持出中の場合: 持出日時
  returned_on: string | null; // 本人へ返却した日
  note: string;
  // 預かり証の記載内容（発行時点のスナップショット。0027）
  holder_name: string; // 氏名（在留カード記載のローマ字）
  holder_nationality: string; // 国籍・地域
  holder_birth: string | null; // 生年月日
  holder_card_no: string; // 在留カード番号
  holder_residence_status: string; // 在留資格
  holder_card_expire: string | null; // 在留期間（満了日）
  agent_cert_expire: string | null; // 申請取次者証明書 有効期限
  front_image_path: string; // 在留カード表面画像（app-files）
  back_image_path: string; // 在留カード裏面画像（app-files）
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---- 入社書類メール（0029_onboarding.sql） ----

export const ONBOARDING_DOC_STATUSES = ["添付", "後送", "未入手", "対象外"] as const;
export type OnboardingDocStatus = (typeof ONBOARDING_DOC_STATUSES)[number];

// 外国人1人につき1件のメール作成情報
export interface OnboardingRecordRow {
  id: string;
  worker_id: string;
  org_name: string; // 宛名（所属機関名）
  org_honorific: "御中" | "様";
  employment_start_on: string | null; // 雇用開始年月日
  permit_on: string | null; // 在留許可日
  office: string; // 配属先営業所
  residence: string; // 居住地
  sender: string; // 送信者名
  extra_note: string; // 追記事項
  gmail_link: string; // 最初に送ったGmailのメールリンク
  mail_sent_on: string | null; // 最初にメールを送った日
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 書類ごとのステータス・後送期日・アップロードファイル
export interface OnboardingDocumentRow {
  id: string;
  worker_id: string;
  doc_key: string; // lib/onboarding.ts の ONBOARDING_DOCS のキー
  label: string;
  sort_no: number;
  status: OnboardingDocStatus;
  note: string;
  due_on: string | null; // 後送: いつまでに送るか
  received_on: string | null; // 後送: 本人が送ってきた日
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustodyEventRow {
  id: string;
  custody_id: string;
  action: CustodyAction;
  person: string; // 持ち出した人・対応した担当者
  purpose: string; // 目的・メモ
  happened_at: string;
  created_by: string | null;
  created_at: string;
}

export type CustodyInput = Omit<
  CustodyRecord,
  "id" | "status" | "holder" | "held_since" | "returned_on" | "created_by" | "created_at" | "updated_at"
>;
