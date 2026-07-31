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
  intake: Partial<OrganizationIntake>; // 登録支援機関への申込書の内容（0043）。旧行は {}
  created_at: string;
  updated_at: string;
}

// ---- 登録支援機関への申込書（organizations.intake jsonb） ----

// 決算情報の1期分。行は年月の経過に合わせて追加できる。
// 個人事業主: 「令和{year}年分売上情報」 / 法人: 「{term}期分（令和{period_from}〜令和{period_to}）」
export interface OrgFinancialYear {
  year: string; // 個人事業主: 令和何年分（例: 6）
  term: string; // 法人: 何期分（例: 12）
  period_from: string; // 法人: 期間の開始（例: 7年4月）
  period_to: string; // 法人: 期間の終了（例: 8年3月）
  sales: string; // 売上高
  ordinary: string; // 経常損益
  net: string; // 純損益
  assets: string; // 純資産
}

// 一緒に働く日本人常勤職員（専従者）。定期報告の際に賃金台帳を提出する対象
export interface OrgJapaneseStaff {
  name: string; // 氏名
  role: string; // 役職・職務内容・責任程度
  profile: string; // 年齢・性別・経験年数
  pay: string; // 報酬（月給/時給）
}

// 所属役員（法人の場合）
export interface OrgOfficer {
  kana: string; // ふりがな
  name: string; // 氏名
  title: string; // 役職
  not_involved: boolean; // 特定技能外国人の受入れ業務の執行に直接関与しない
}

// 寮・宿泊物件の1件分。女子寮・男子寮など複数登録できる
export interface OrgLodging {
  id: string; // 賃貸契約書の添付ファイルとの紐付けに使う識別子（行の追加時に採番）
  name: string; // 寮の名前（例: 女子寮 / 男子寮 / 第1寮）
  address: string; // 宿泊住所
  kind: string; // 宿泊物件の区分（自己所有物件 / 賃貸物件）
  total_cost: string; // 自己所有: かかった総費用（円）
  equipment_cost: string; // 自己所有: 備品代（円）
  useful_years: string; // 自己所有: 耐用年数（年）
  rent: string; // 家賃（月額・円）
  max_residents: string; // 最大入居人数
}

// 申込書の入力内容一式
export interface OrganizationIntake {
  kana: string; // 名称フリガナ
  phone: string; // 電話番号（旧項目。連絡先(organizations.contact)に統合済み・未移行データ用に残す）
  fax: string; // FAX
  email: string; // Email
  report_staff: string; // 定期報告書・随時報告書の担当者名（退職の随時報告書へ自動転記）
  staff_primary: string; // この機関の主担当（会社との窓口・進捗管理の責任者）
  staff_secondary: string; // この機関の副担当（主担当不在時のバックアップ）
  fiscal_kind: string; // 決算情報の区分（個人事業主 / 法人）
  support_fee: string; // 毎月の支援代（月額）
  posting_note: string; // 求人で必須としている他条件（求人情報で注意喚起表示）
  contact_method: string; // 資料のやりとり方法（FAX / グループLINE / email）
  health_insurance: string; // 保険（国民健康保険 / 社会保険 / その他）
  pension: string; // 年金（国民年金 / 厚生年金）
  ssw_insurance_burden: string; // 特定技能総合保険の負担（'' / 会社負担 / 外国人負担）
  work_address: string; // 作業する住所（会社の住所と別の場合）
  work_contact: string; // 作業する住所の TEL・FAX
  rep_kana: string; // 代表者フリガナ
  rep_name: string; // 代表者役職・氏名
  capital: string; // 資本金（法人）
  fiscal_month: string; // 決算月（法人）
  staff_japanese: string; // 常勤職員数: 日本人
  staff_trainee: string; // 常勤職員数: 技能実習生
  staff_ssw1: string; // 常勤職員数: 特定技能1号
  staff_ssw2: string; // 常勤職員数: 特定技能2号
  staff_katsudo: string; // 常勤職員数: 特定活動
  staff_updated_on: string; // 常勤職員数の最終更新日（入力時に自動記録。年1回の更新用）
  financials: OrgFinancialYear[]; // 直近3年分の決算情報
  wage_parity_reason: string; // 報酬が日本人と同等以上であると考えられる理由
  rosai_covered: string; // 労災保険の適用事業所か（'' / はい / いいえ）
  rosai_no: string; // 労働保険番号
  koyo_covered: string; // 雇用保険の適用事業所か（'' / はい / いいえ）
  koyo_no: string; // 雇用保険適用事業所番号
  lodgings: OrgLodging[]; // 寮・宿泊物件（複数可。旧フラット項目 lodging_* は normalize で1件目に移行）
  first_hired_on: string; // 国籍問わず労働者を雇用開始した日付（大体）
  missing_ssw: string; // 過去1年間の行方不明者数（特定技能）
  missing_trainee: string; // 過去1年間の行方不明者数（技能実習生）
  council_note: string; // 協議会の加入・協力確認書の提出先/提出日
  japanese_staff: OrgJapaneseStaff[]; // 一緒に働く日本人常勤職員
  officers: OrgOfficer[]; // 所属役員（法人）
}

// 所属機関に添付するファイル（見積書など。0049_organization_files.sql）
export interface OrganizationFileRow {
  id: string;
  organization_id: string;
  kind: string; // 見積書 など
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

// 扶養家族の1人分（workers.dependents jsonb に配列で保存）。
// 外国人から届く扶養親族証明書の内容を記録し、扶養控除等申告書の作成に使う
export interface WorkerDependent {
  name: string; // 氏名（例: PORY PHANNA）
  kana: string; // フリガナ（例: ポーイ パンナー）
  relation: string; // 続柄（父・母・妹・配偶者 など）
  birth: string; // 生年月日 YYYY-MM-DD（未入力は ''）
  address: string; // 住所（母国住所など）
  occupation: string; // 職業及び年収（例: FARMER）
  my_number: string; // 個人番号（あれば）
  income: string; // 年中の所得の見積額・送金額のメモ
}

// 所属機関別の雇用開始日の1件分（workers.org_employment_starts jsonb に配列で保存）。
// 転職すると機関ごとに雇用開始日が異なるため機関別に記録する
export interface WorkerOrgEmploymentStart {
  organization_id: string; // 所属機関ID（organizations.id）
  start_on: string; // 雇用開始日 YYYY-MM-DD（未入力は ''）
}

// 同居している在日親族の1人分（workers.relatives jsonb に配列で保存）
export interface WorkerRelative {
  name: string; // 氏名
  birth: string; // 生年月日 YYYY-MM-DD（未入力は ''）
  workplace: string; // 勤務先
  residence_card_no: string; // 在留カード番号
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
  health_check_on?: string | null; // 健康診断の受診日（有効期限は受診日の1年後）
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
  has_spouse: string; // 配偶者の有無（'' / 有 / 無）
  relatives_in_japan: string; // 在日親族の同居の有無（'' / 有 / 無）
  relatives: WorkerRelative[]; // 同居している在日親族
  dependents: WorkerDependent[]; // 扶養家族（扶養親族証明書の内容）
  address: string; // 住所（履歴書に表示）
  employment_start_on: string | null; // 雇用開始年月日（現在の所属機関のもの）
  org_employment_starts: WorkerOrgEmploymentStart[]; // 所属機関別の雇用開始日
  assigned_office: string; // 配属先営業所
  residence_note: string; // 居住先（社宅・自分のアパート など）
  photo_path: string | null; // 顔写真（worker-files バケット）
  messenger_link: string; // Messenger グループ/個人リンク
  specialty_grade: string; // 専門級の合格名
  other_qualifications: string; // その他の資格・合格名
  my_number: string; // 個人番号（マイナンバー）
  employment_insurance_no: string; // 雇用保険被保険者番号
  pension_no: string; // 基礎年金番号
  ssw_insurance_link: string; // 特定技能総合保険の加入ページリンク
  ssw_insurance_expiry_date: string | null; // 特定技能総合保険の有効期限
  ssw_insurance_self_join: boolean; // 自己負担加入希望（所属機関が外国人負担の場合に本人が加入を希望）
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

// ---- 労働者名簿（0054_worker_rosters.sql） ----

// 履歴の1行分（年月日・内容とも表示文字列のまま保存）
export interface RosterHistoryEntry {
  on: string; // 年月日（例: 2026年7月31日）
  content: string; // 内容（例: 入社）
}

// 前職の1行分
export interface RosterPreviousJob {
  company: string; // 会社名
  prefecture: string; // 都道府県
}

// 会社へ送る労働者名簿。転職があるため外国人1人につき会社ごとに複数件持てる
export interface WorkerRoster {
  id: string;
  worker_id: string;
  company_name: string; // 送付先の会社名（名簿の識別に使う）
  work_kind: string; // 業務の種類（例: 耕種農業の一般社員（役員なし））
  history: RosterHistoryEntry[];
  previous_jobs: RosterPreviousJob[];
  leaving_on: string; // 解雇・退職または死亡の年月日（表示文字列）
  leaving_reason: string; // 同・事由
  issued_on: string | null; // 発行年月日（労基法109条: 発行から5年間保存）
  created_at: string;
  updated_at: string;
}

export type WorkerRosterInput = Omit<WorkerRoster, "id" | "created_at" | "updated_at">;

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

// ---- 入管メール通知（0050_mail_notifications.sql） ----

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

// 訂正・追送で送った書類の1件分（onboarding_followups.docs jsonb に配列で保存）
export interface OnboardingFollowupDoc {
  label: string; // 書類名
  kind: "訂正版" | "追加"; // 訂正版の再送か、追加資料か
  note: string; // 備考
}

// 入社書類メールの訂正・追送の送付履歴（0059_onboarding_followups.sql）
export interface OnboardingFollowupRow {
  id: string;
  worker_id: string;
  sent_on: string | null; // 送った日
  reason: string; // 訂正・追送の理由
  docs: OnboardingFollowupDoc[];
  created_at: string;
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
  due_on: string | null; // 後送・未入手: いつまでに送るか
  received_on: string | null; // 後送・未入手: 本人が送ってきた日
  pending_since: string | null; // 後送・未入手にした日（経過日数アラートの起点）
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
