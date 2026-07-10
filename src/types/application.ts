// docs/00_system_design.md の Google Sheets 列構成(4.1)に対応する型定義

export type ApplicationStatus =
  | "申請前"
  | "申請済"
  | "LINE報告済"
  | "通知書到着"
  | "許可済";

export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "申請前",
  "申請済",
  "LINE報告済",
  "通知書到着",
  "許可済",
];

// 申請内容は自由入力ではなく、この3種類から選択する
export const APPLICATION_CONTENT_OPTIONS = [
  "在留資格の変更許可",
  "在留期間の更新許可",
  "在留認定許可申請",
] as const;

export type ApplicationContent = (typeof APPLICATION_CONTENT_OPTIONS)[number];

// 申請方法: 窓口申請（入管窓口で受付票を受け取る）/ オンライン申請（メールで受付確認が届く）
export const APPLICATION_METHOD_OPTIONS = ["窓口申請", "オンライン申請"] as const;

export type ApplicationMethod = (typeof APPLICATION_METHOD_OPTIONS)[number];

export interface Application {
  id: string;
  name: string; // 氏名
  applicationDate: string; // 申請日 (YYYY-MM-DD)
  applicationNumber: string; // 申請番号
  applicationContent: ApplicationContent | ""; // 申請内容
  applicationMethod: ApplicationMethod; // 申請方法（窓口申請/オンライン申請）
  emailLink?: string; // オンライン申請時: 確認メールに記載されたリンクURL
  emailBody?: string; // オンライン申請時: 確認メール本文の転記
  receiptImageUrl?: string; // 受付票画像URL（窓口申請時）
  noticeImageUrl?: string; // 通知書画像URL
  residenceCardImageUrl?: string; // 在留カード画像URL
  approvalDate?: string; // 許可日
  lineReported: boolean; // LINE報告済
  notionSynced: boolean; // Notion同期済
  approved: boolean; // 許可済
  status: ApplicationStatus;
  assignee: string; // 担当者
  createdAt: string; // 登録日時
  updatedAt: string; // 更新日時
  notionPageId?: string;
}
