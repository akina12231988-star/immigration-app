// Supabase のテーブル行に対応する型（docs/03_database_design.md）。
// スキーマ確定後は `supabase gen types typescript` による自動生成へ置き換える。

import type { VisaType } from "@/types/ssw";
import type { WorkerCertExam } from "@/lib/cert-exam";
import type { WorkerFollowups } from "@/lib/worker-followups";
import type { OrgSsw2Duties } from "@/lib/org-ssw2-duties";

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

// ---- 弊社の従業員・支援体制（0062_employees.sql） ----

export const EMPLOYMENT_KINDS = ["常勤", "非常勤"] as const;
export type EmploymentKind = (typeof EMPLOYMENT_KINDS)[number];

// 弊社（登録支援機関）の従業員。支援責任者・支援担当者の選任元になる
export interface Employee {
  id: string;
  name: string;
  kana: string;
  joined_on: string | null; // 入社日 YYYY-MM-DD
  left_on: string | null; // 退職日（入力があれば在籍対象から外す）
  employment_kind: string; // 常勤 / 非常勤
  is_representative: boolean; // 代表か（個人事業主本人・法人の代表者。役員との併用可）
  is_officer: boolean; // 役員か
  is_support_manager: boolean; // 現在 支援責任者をしている（所属機関の支援責任者に選任できる）
  is_support_staff: boolean; // 現在 支援担当者をしている（所属機関の支援担当者に選任できる）
  office: string; // 支援業務を行う事務所
  training_completed_on: string | null; // 支援責任者の養成講習 修了日
  note: string;
  created_at: string;
  updated_at: string;
}

export type EmployeeInput = Omit<Employee, "id" | "created_at" | "updated_at">;

// ---- 外国人・職歴・所属機関（0003_core.sql） ----

export const SUPPORT_SCOPES = ["支援開始前", "支援対象", "支援対象外"] as const;
export type SupportScope = (typeof SUPPORT_SCOPES)[number];

// 「支援中」は「在籍中」へ統一済み（0068_unify_worker_status.sql）。
// 支援しているかどうかは支援区分（support）で管理する
export const WORKER_STATUSES = [
  "申請準備中",
  "在籍中",
  "求職活動中",
  "帰国",
  "退職",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

// 現在の在留資格の選択肢（外国人詳細で選択して登録する）。
// この一覧にない表記が登録済みの場合は、その表記も選択肢に残して削除しない
export const RESIDENCE_STATUSES = [
  "技能実習1号",
  "技能実習2号",
  "技能実習3号",
  // 表記は只今の状況の選択肢と同じ「以降準備」にそろえる（登録済みの「移行準備」も選択肢に残る）
  "特定活動（特定技能1号以降準備）",
  "特定活動（特定技能2号移行準備）",
  "特定技能1号",
  "特定技能2号",
] as const;

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
  annual_work_hours?: number; // 年間所定労働時間（時給⇔月給の換算に使う。0 = 未登録。0082）
  ssw2_duties?: OrgSsw2Duties; // 特定技能2号の誓約書に書く業務内容の雛形（0123）
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
  purchase_state: string; // 自己所有: 購入時の状態（'' / 新品 / 中古）。耐用年数の目安を出すのに使う
  elapsed_years: string; // 自己所有・中古: 購入時の築年数（年）
  total_cost: string; // 自己所有: かかった総費用（円）
  equipment_cost: string; // 自己所有: 備品代（円）
  useful_years: string; // 自己所有: 耐用年数（年）
  rent: string; // 家賃（1人あたり・月額・円）
  max_residents: string; // 最大入居人数
}

// 申請種別ごとの売上明細の1行（freee販売に登録する内容の雛形）
export interface OrgSalesItem {
  name: string; // 明細項目（例: 申請取次費用）
  amount: string; // 金額（例: 150,000円）
}

// 申請種別（特定技能申請 など）→ その種別で登録する売上明細
export type OrgSalesItems = Record<string, OrgSalesItem[]>;

// 支援委託の状況。「支援委託中」と「特定技能1号の許可後に支援委託開始」は、
// 委託を受けている特定技能所属機関としてカウントする（支援責任者の必要人数に影響する）
export const SUPPORT_CONTRACT_STATUSES = [
  "支援委託前",
  "特定技能1号の許可後に支援委託開始",
  "支援委託中",
  "支援委託終了",
] as const;
export type SupportContractStatus = (typeof SUPPORT_CONTRACT_STATUSES)[number];

// 委託を受けている機関として数える状況
export const CONTRACTED_SUPPORT_STATUSES: readonly SupportContractStatus[] = [
  "特定技能1号の許可後に支援委託開始",
  "支援委託中",
];

// 申込書の入力内容一式
export interface OrganizationIntake {
  kana: string; // 名称フリガナ
  phone: string; // 電話番号（旧項目。連絡先(organizations.contact)に統合済み・未移行データ用に残す）
  fax: string; // FAX
  email: string; // Email
  report_staff: string; // 定期報告書・随時報告書の担当者名（退職の随時報告書へ自動転記）
  staff_primary: string; // 旧項目: この機関の主担当。support_managers へ移行済み（未移行データ用に残す）
  staff_secondary: string; // 旧項目: この機関の副担当。support_staff へ移行済み（未移行データ用に残す）
  support_contract_status: string; // 支援委託の状況（SUPPORT_CONTRACT_STATUSES。'' = 未設定）
  support_managers: string[]; // この機関の支援責任者（複数可・employees.name）
  support_staff: string[]; // この機関の支援担当者（複数可・employees.name。支援責任者との兼任可）
  fiscal_kind: string; // 決算情報の区分（個人事業主 / 法人）
  support_fee: string; // 毎月の支援代（月額）
  posting_note: string; // 求人で必須としている他条件（求人情報で注意喚起表示）
  posting_gensen: string; // 求人票に記載する源泉所得税（扶養0人・円。徴収しない会社は「なし」。求人票へ自動反映）
  posting_utility_cost: string; // 求人票に記載する水道光熱費（約・円）
  posting_utility_kind: string; // 水道光熱費の徴収（'' / 実費 / 固定）
  posting_comm_cost: string; // 求人票に記載する通信費（約・円。徴収しない会社は「無し」）
  posting_comm_reason: string; // 通信費を徴収しない理由（聞いていたら記録する）
  posting_pay_closing: string; // 求人票に記載する給与の締切日（例: 末日）
  posting_pay_day: string; // 求人票に記載する給与の支払日（例: 翌月10日）
  posting_other_conditions: string; // 求人票のその他（応募条件）。タトゥー（刺青）不可など採用時の注意
  posting_monthly_hours: string; // 月平均所定労働時間数（時給⇔月給の換算に使う）
  posting_annual_hours: string; // 年間所定労働時間数（月平均×12。時給⇔月給の換算・手取り計算に使う）
  flex_hours_kind: string; // 変形労働時間制（'' / なし / 1ヶ月単位 / 1年単位）
  flex_docs_start: string; // 変形労働時間制（1年単位）の書類の有効期間の開始日（1年間有効）
  contact_method: string; // 資料のやりとり方法（FAX / グループLINE / email）
  health_insurance: string; // 保険（国民健康保険 / 社会保険 / その他）
  pension: string; // 年金（国民年金 / 厚生年金）
  pay_method: string; // 給与支払い方法（'' / 通貨払い / 口座振込。1-6号別紙に反映）
  ssw_insurance_burden: string; // 特定技能総合保険の負担（'' / 会社負担 / 外国人負担）
  sales_items: OrgSalesItems; // 申請種別ごとの売上明細（freee販売への登録内容）
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
  council_note: string; // 協議会の加入メモ（旧: 協力確認書の提出先/提出日をまとめて書いていた欄）
  council_office_submissions: OrgCouncilSubmission[]; // 協力確認書の提出（特定技能外国人の活動する事業所の所在地・複数可）
  council_residence_submissions: OrgCouncilSubmission[]; // 協力確認書の提出（特定技能外国人の住居地・複数可）
  japanese_staff: OrgJapaneseStaff[]; // 一緒に働く日本人常勤職員
  officers: OrgOfficer[]; // 所属役員（法人）
}

// 協力確認書の提出1件分（提出先と提出日を分けて持つ）
export interface OrgCouncilSubmission {
  to: string; // 提出先
  on: string; // 提出日（YYYY-MM-DD）
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

// 求人の添付ファイル（記載してもらった求人票のPDF・画像。0094）
export interface PostingFileRow {
  id: string;
  posting_id: string;
  kind: string; // 求人票 など
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string | null;
  created_at: string;
}

// TODOに添付するファイル（発行されたアプリケーションNo.のPDF・画像など・0109）
export interface TodoFileRow {
  id: string;
  todo_id: string;
  kind: string; // アプリケーションNo. など
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
  remittances: DependentRemittance[]; // 年末の国際送金明細書の各行（対象年つき）
}

// 国際送金の1行分。年末調整は年ごとに行うため、どの年の送金かを持つ
export interface DependentRemittance {
  year: string; // 対象年（西暦4桁。例: 2026。未設定は ''）
  amount: string; // 金額（入力したままの文字列）
}

// 合格証の受験情報の1件分（workers.cert_exams jsonb に配列で保存。詳細は lib/cert-exam.ts）
export type { WorkerCertExam };

// 所属機関別の雇用開始日の1件分（workers.org_employment_starts jsonb に配列で保存）。
// 転職すると機関ごとに雇用開始日が異なるため機関別に記録する
export interface WorkerOrgEmploymentStart {
  organization_id: string; // 所属機関ID（organizations.id）
  start_on: string; // 雇用開始日 YYYY-MM-DD（未入力は ''）
  // 雇用契約書・雇用条件書の日付（外国人詳細の契約書の欄で入れる）。
  // org_employment_starts（jsonb）の中に足しているため、列の追加は不要
  contract_on?: string; // 雇用契約日 YYYY-MM-DD（未入力は ''）
  conditions_on?: string; // 雇用条件書の作成日 YYYY-MM-DD（未入力は ''）
}

// 過去の定期売上No.の1件分（workers.past_recurring_sales jsonb に配列で保存）。
// 定期売上No.は所属機関ごとに発行するため、転職前の番号を旧機関と紐付けて残す
export interface WorkerPastRecurringSale {
  organization_id: string; // 当時の所属機関ID（organizations.id）
  sales_no: string; // 当時の定期売上No.（例: SP-0000000225）
}

// 求職票（求職申込書）だけで使う項目（workers.jobseeker_card jsonb に保存。0118）。
// 電話番号・希望条件は求職票にしか出てこないため、列を増やさずまとめて持つ
export interface JobseekerCardExtras {
  phone: string; // 電話番号
  desired_location: string; // 希望勤務地
  desired_wage: string; // 希望賃金
  available_from: string; // 就業できる時期
  other_wish: string; // その他の希望
  // 求職票に書く職歴。最初は外国人の職歴をそのまま出し、この画面で直したら
  // ここに求職票のぶんとして残す（外国人の職歴には書き戻さない）
  jobs: JobseekerCardJob[];
  // 氏名・住所・在留資格などを求職票で直したときの控え。
  // 求職票は求職受付のときの控えなので、あとから外国人の登録が変わっても
  // ここに入っているぶんはそのまま残す（入っていない項目は外国人の登録内容を出す）
  fields: Partial<Record<JobseekerCardFieldKey, string>>;
}

// 求職票で直せる、外国人の登録内容と同じ項目
export type JobseekerCardFieldKey =
  | "name"
  | "kana"
  | "gender"
  | "birth"
  | "nationality"
  | "address"
  | "homeAddress"
  | "residenceStatus"
  | "residencePeriod"
  | "residenceExpiry"
  | "residenceCardNo"
  | "passportNo"
  | "passportExpiry"
  | "field";

// 求職票に書く職歴の1行
export interface JobseekerCardJob {
  start: string; // 開始 YYYY-MM-DD
  end: string; // 終了 YYYY-MM-DD（継続中は空）
  org: string; // 勤務先
  role: string; // 仕事内容
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
  passport_issue_date: string | null; // パスポート発行年月日（DATE OF ISSUE。0130）
  passport_expiry_date: string | null; // パスポート有効期限
  passport_mrz: string; // パスポートMRZの2行（読み取り反映時に保存。コピー用。0095）
  residence_period: string; // 在留カードの在留期間（例: 1年・3年・6月。0092）
  current_situation: string; // 只今の状況（経過メモ。Notionの只今の状況と同期。0093）
  notion_link: string; // Notion 個人ページのリンク
  residence_renewal_status: ResidenceRenewalStatus; // 在留更新の対応状況
  residence_renewal_todo: string; // Notion 申請TODO番号
  application_prep_kind: string; // 申請準備の区分（'' = 更新 / '新規' = 新規で申請書類準備）
  // 申請準備の所属機関（転職の場合の転職先）。0084。organizations.id。
  // 現在の所属機関は在留カード受領まで変えないため、準備中はこちらを表示する
  application_prep_organization_id: string | null;
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
  address: string; // 日本での住所（履歴書・労働者名簿に表示）
  home_address: string; // 母国の住所（本国の住所。0091）
  employment_start_on: string | null; // 雇用開始年月日（現在の所属機関のもの）
  org_employment_starts: WorkerOrgEmploymentStart[]; // 所属機関別の雇用開始日
  assigned_office: string; // 配属先営業所
  residence_note: string; // 居住先（社宅・自分のアパート など）
  photo_path: string | null; // 顔写真（worker-files バケット）
  messenger_link: string; // Messenger グループ/個人リンク
  file_link?: string; // 資料ファイル（Google Drive のフォルダなど）へのリンク（0127）
  specialty_grade: string; // 専門級の合格名
  jisshu2_shokushu?: string; // 良好に修了した技能実習2号の職種名（0110）
  jisshu2_sagyo?: string; // 良好に修了した技能実習2号の作業名（0110）
  jisshu2_proof?: string; // 良好修了の証明（'' / 実技試験の合格 / 書面による証明。0110）
  ssw2_exam: string; // 特定技能2号の合格試験名（入力があれば2号合格として扱う）
  other_qualifications: string; // その他の資格・合格名
  // 日本語の合格証・専門外の合格証: 1件目の受験した試験名・受験地（0114）とレベル（0115）
  cert_nihongo_name?: string; // 例:「日本語能力試験　JLPT」
  cert_nihongo_location?: string; // 「日本国内」、または海外の場合はその国名
  cert_nihongo_level?: string; // 日本語の合格証のレベル（N4/N3/N2/N1）
  cert_senmongai_name?: string;
  cert_senmongai_location?: string;
  cert_exams?: WorkerCertExam[]; // 2件目以降の受験情報（0115）
  my_number: string; // 個人番号（マイナンバー）
  employment_insurance_no: string; // 雇用保険被保険者番号
  pension_no: string; // 基礎年金番号
  ssw_insurance_link: string; // 特定技能総合保険の加入ページリンク
  ssw_insurance_expiry_date: string | null; // 特定技能総合保険の有効期限
  ssw_insurance_self_join: boolean; // 自己負担加入希望（所属機関が外国人負担の場合に本人が加入を希望）
  note: string;
  jobseeker_card?: JobseekerCardExtras; // 求職票だけで使う項目（0118）
  followups?: WorkerFollowups; // あとでやる手続きの宿題（転居手続き・国保/国民年金の加入。0119）
  jobseeker_no?: string; // 求職受付番号（求職管理簿。例: R8KS-2。0079）
  jobseeker_accepted_on?: string | null; // 求職受付年月日（0079）
  jobseeker_valid_until?: string | null; // 求職の有効期間（終了日。0079）
  recurring_sales_no: string; // 定期売上No.（freee販売の定期売上の伝票番号。例: SP-0000000225）
  past_recurring_sales: WorkerPastRecurringSale[]; // 過去の定期売上No.（転職前の所属機関の番号）
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
  prefecture: string; // 勤務先の都道府県（労働者名簿の「前職」欄へ転記する）
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

// ---- freee販売への売上登録（0061_sales_entries.sql） ----

export type SalesEntryStatus = "未登録" | "登録済み" | "対象外";

export interface SalesEntryRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  application_id: string | null;
  kind: string; // 申請 / 保険 / 支援代日割り / 定期売上 / 退職精算
  item_name: string; // 品目
  description: string; // freeeに記載する内容
  amount: number;
  taxable: boolean; // false = 非課税
  period_from: string | null;
  period_to: string | null;
  status: SalesEntryStatus;
  freee_no: string; // freee販売の伝票番号など
  registered_on: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export type SalesEntryInput = Omit<SalesEntryRow, "id" | "created_at" | "updated_at">;

// ---- 所属機関ごとの請求・入金の記録（0070_org_invoices.sql） ----

// 月ごとの請求（請求書番号・実際の請求金額）と入金（入金済み額・入金日）の台帳。
// 残額がある請求は督促状の一覧に自動で載る
export interface OrgInvoice {
  id: string;
  organization_id: string;
  month: string; // 対象の年月 YYYY-MM
  billed_on: string | null; // 請求日（通常は月初）
  invoice_created_on: string | null; // 請求書を作成した日（未作成なら null）
  reminder_sent_on: string | null; // 督促状を発行した日（未発行なら null）
  invoice_no: string; // 請求書番号（freeeのINV-…）
  amount_excl: number; // 税抜金額（10%の課税対象）
  tax: number; // 消費税額
  tax_free: number; // 非課税額（特定技能総合保険 など）
  amount: number; // 税込金額（実際に請求した額。amount_excl + tax + tax_free）
  paid: number; // 入金済み額（実際に振り込まれた税込金額）
  paid_on: string | null; // 入金日
  due_on: string | null; // 支払期限（通常は月末）
  note: string;
  created_at: string;
  updated_at: string;
}

export type OrgInvoiceInput = Omit<OrgInvoice, "id" | "created_at" | "updated_at">;

// ---- 賃金の記録（0074_worker_wages.sql） ----

export const WORKER_WAGE_KINDS = ["時給", "月給", "日給", "年収"] as const;
export type WorkerWageKind = (typeof WORKER_WAGE_KINDS)[number];

// ---- 1-6号別紙（賃金の支払）の内容（0089_worker_wage_detail.sql の detail） ----
//
// 賃金を入れるときに「どういう内容で参考様式第1-6号 別紙1を作ったか」を残す。
// 計算（所得税・社会保険料・雇用保険料・手取り）は src/lib/wage-calc.ts で行う。

// 諸手当の1行（家族手当・通勤手当など）
export interface WageAllowance {
  type: string; // 手当の種類
  name: string; // 手当名（任意）
  amount: number; // 月額（円）
  method: string; // 計算方法（別紙にそのまま書く文）
}

// その他控除の1行
export interface WageOtherDeduction {
  name: string; // 項目名
  amount: number; // 金額（円）
}

// 年齢区分（介護保険料が乗るのは40〜64歳のみ）
export const WAGE_AGE_BANDS = ["40歳未満", "40〜64歳", "65歳以上"] as const;
export type WageAgeBand = (typeof WAGE_AGE_BANDS)[number];

// 水道光熱費の徴収の仕方
export const WAGE_UTILITY_KINDS = ["実費", "固定額"] as const;
export type WageUtilityKind = (typeof WAGE_UTILITY_KINDS)[number];

export interface WageDetail {
  annual_hours: number; // 計算に使った年間所定労働時間（0 = 所属機関の登録値を使う）
  allowances: WageAllowance[]; // 諸手当
  fixed_ot_enabled: boolean; // 固定残業代があるか
  fixed_ot_amount: number; // 固定残業代（円）
  fixed_ot_hours: number; // 固定残業代に含む時間外労働の時間数
  tax_spouse: boolean; // 源泉控除対象配偶者あり
  tax_dependents: number; // 扶養親族等の数（人）
  social_enabled: boolean; // 社会保険（健康保険・厚生年金）に加入する
  health_prefecture: string; // 健康保険料率の都道府県（協会けんぽ。"手入力" は下の率を使う）
  health_rate: number; // 健康保険料率（%）
  age_band: WageAgeBand;
  employment_enabled: boolean; // 雇用保険に加入する
  employment_kind: string; // 事業の種類（雇用保険料率）
  food_cost: number; // 食費（円）
  housing_self_contract: boolean; // 本人が自分で住居を契約する（居住費は徴収しない）
  housing_lodging_id: string; // 所属機関に登録した寮・社宅のID
  housing_amount: number; // 1人当たり居住費（円/月）
  housing_note: string; // 居住費の算定方法・説明文
  utility_kind: WageUtilityKind;
  utility_amount: number; // 水道光熱費（円）
  others: WageOtherDeduction[]; // その他控除
  company_agreed: boolean; // 1-6号別紙の内容について会社（所属機関）から同意を得たか
}

// 昇給のたびに1行増やし、適用開始日がいちばん新しい行が現在の賃金になる
export interface WorkerWage {
  id: string;
  worker_id: string;
  organization_id: string | null; // どの機関での賃金か
  kind: WorkerWageKind;
  amount: number; // 金額（円）
  started_on: string; // 適用開始日（採用日・昇給日）YYYY-MM-DD
  reason: string; // 採用時 / 昇給 など
  note: string;
  // 1-6号別紙（賃金の支払）の内容。未入力は {}（0089_worker_wage_detail.sql）
  detail: Partial<WageDetail> | null;
  created_at: string;
  updated_at: string;
}

export type WorkerWageInput = Omit<
  WorkerWage,
  "id" | "created_at" | "updated_at"
>;

// ---- 人材紹介（あっせん）手数料の台帳（0067_referral_fees.sql） ----

// 全所属機関のあっせん手数料をまとめて管理し、請求年月日・入金年月日を記録する
export interface ReferralFee {
  id: string;
  worker_id: string | null;
  organization_id: string | null;
  worker_name: string; // 氏名（外国人が削除されても台帳に残すための控え）
  domestic: string; // 国内・国外
  jobseeker_no: string; // 求職受付番号（例: R8KS-2）
  employer_name: string; // 求人者（求職簿）
  referred_on: string | null; // 紹介年月日
  hired_on: string | null; // 採用年月日
  fee: number; // 手数料（円・税抜）
  sales_no: string; // 紹介売上No.（freee販売）
  billed_on: string | null; // 請求年月日
  paid_on: string | null; // 入金年月日
  note: string;
  job_application_id: string | null; // 紐づく応募（求職一覧の行。0078）
  sales_checked_on: string | null; // freee販売で売上登録を確認した日（0078）
  fee_kind: string; // 手数料の種類（手数料管理簿。既定「紹介手数料」。0079）
  calc_basis: string; // 手数料の算出根拠（手数料管理簿。例: 賃金総額150万円×11％。0079）
  created_at: string;
  updated_at: string;
}

// 0078・0079の追加列は未適用の環境でも追加が通るよう任意にする
export type ReferralFeeInput = Omit<
  ReferralFee,
  | "id"
  | "created_at"
  | "updated_at"
  | "job_application_id"
  | "sales_checked_on"
  | "fee_kind"
  | "calc_basis"
> &
  Partial<
    Pick<ReferralFee, "job_application_id" | "sales_checked_on" | "fee_kind" | "calc_basis">
  >;

// ---- ◯月分の支援代のfreee登録記録（0066_monthly_support_registrations.sql） ----

// 月末の請求書作成で「freee売上登録」ボタンを押すと1人×対象年月で記録し、
// 登録漏れ・二重登録を防ぐ。名称は特定活動なら「サポート代」、それ以外は「支援代」
export interface MonthlySupportRegistration {
  id: string;
  worker_id: string;
  month: string; // 対象の年月 YYYY-MM
  fee_name: string; // 支援代 / サポート代
  registered_on: string | null; // 登録した日
  note: string; // メモ（この月に請求しない理由など。0069_monthly_support_note.sql）
  no_charge: boolean; // この月の支援代を請求しない（0077_monthly_support_no_charge.sql）
  created_at: string;
  updated_at: string;
}

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

// 進み具合（0086）: 届出書を作ったら「署名依頼中」、投函したら「投函完了」
export const RESIGNATION_STATUSES = ["準備中", "署名依頼中", "投函完了"] as const;
export type ResignationStatus = (typeof RESIGNATION_STATUSES)[number];

export interface ResignationRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  org_name: string; // 退職元機関のスナップショット
  org_address: string;
  org_contact: string;
  kind: ResignationKind; // 会社都合 / 自己都合
  reason: string; // 退職理由
  leaving_on: string | null; // 退職日 YYYY-MM-DD（未定のときは null・0087）
  todo_no: string; // Notion随時報告TODO番号
  note: string;
  // 進み具合（0086）。マイグレーション未適用の環境では欠けることがある
  status?: ResignationStatus;
  forms_downloaded_at?: string | null; // 様式を最初にダウンロードした日時
  posted_on?: string | null; // レターパックで投函した日
  tracking_no?: string; // レターパックの追跡番号
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ResignationInput = Omit<
  ResignationRow,
  "id" | "created_by" | "created_at" | "updated_at"
>;

// 契約内容変更の随時報告書（参考様式第3-1-1号。0133）
export interface ContractChangeRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  org_name: string; // 届出機関のスナップショット
  org_address: string;
  org_contact: string; // 電話番号
  org_staff: string; // 担当者
  changed_on: string; // 変更年月日 YYYY-MM-DD
  items: string[]; // 変更事項のコード（I〜IX）
  detail: string; // 何を変えたかのメモ（社内用）
  todo_no: string; // Notion随時報告TODO番号
  note: string;
  forms_downloaded_at: string | null; // 届出書を最初に作った日時
  // 進み具合と投函の記録（0134）。マイグレーション未適用の環境では欠けることがある
  status?: ResignationStatus;
  posted_on?: string | null; // レターパックで投函した日
  tracking_no?: string; // レターパックの追跡番号
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContractChangeInput = Omit<
  ContractChangeRow,
  | "id"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "forms_downloaded_at"
  | "status"
  | "posted_on"
  | "tracking_no"
>;

// 支援委託終了の随時報告書（参考様式第3-3-2号。0135）
export interface SupportEndRow {
  id: string;
  worker_id: string;
  organization_id: string | null;
  org_name: string; // 届出機関のスナップショット
  org_address: string;
  org_contact: string; // 電話番号
  org_staff: string; // 担当者
  // ① 届出の対象者（特定技能1号のときの内容）
  card_no: string; // 在留カード番号
  field: string; // 特定産業分野
  business_category: string; // 業務区分
  permit_date_2go: string | null; // 特定技能2号の許可日
  ended_on: string; // 終了年月日（許可日の前の日）
  major_reason: string; // 終了の事由（大分類）
  minor_reason: string; // 終了の事由（小分類）
  other_reason: string; // 小分類が「その他」のときの理由
  todo_no: string;
  note: string;
  status?: ResignationStatus; // 進み具合
  forms_downloaded_at: string | null;
  posted_on?: string | null;
  tracking_no?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SupportEndInput = Omit<
  SupportEndRow,
  | "id"
  | "created_by"
  | "created_at"
  | "updated_at"
  | "forms_downloaded_at"
  | "status"
  | "posted_on"
  | "tracking_no"
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
