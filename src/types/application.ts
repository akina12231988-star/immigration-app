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

export interface Application {
  id: string;
  name: string; // 氏名
  applicationDate: string; // 申請日 (YYYY-MM-DD)
  applicationNumber: string; // 申請番号
  applicationContent: ApplicationContent | ""; // 申請内容
  receiptImageUrl?: string; // 受付票画像URL
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
