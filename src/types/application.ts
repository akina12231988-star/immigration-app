// docs/00_system_design.md の列構成に対応する型定義（保存先は Supabase immigration_applications）

export type ApplicationStatus =
  | "申請前"
  | "申請済"
  | "LINE報告済"
  | "通知書到着"
  | "許可済"
  | "在留カード受領"
  | "取下げ";

// ステップ進行の順序（取下げは進行外の終端状態のため含めない）
export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "申請前",
  "申請済",
  "LINE報告済",
  "通知書到着",
  "許可済",
  "在留カード受領",
];

// 一覧の絞り込みに使う全ステータス
export const APPLICATION_STATUS_FILTERS: ApplicationStatus[] = [
  ...APPLICATION_STATUS_ORDER,
  "取下げ",
];

// 申請内容は自由入力ではなく、この3種類から選択する
export const APPLICATION_CONTENT_OPTIONS = [
  "在留資格の変更許可",
  "在留期間の更新許可",
  "在留認定許可申請",
] as const;

export type ApplicationContent = (typeof APPLICATION_CONTENT_OPTIONS)[number];

// 申請方法（窓口=受付票あり / オンライン=受付メールのリンクを記録）
export const APPLICATION_METHODS = ["窓口", "オンライン"] as const;
export type ApplicationMethod = (typeof APPLICATION_METHODS)[number];

// 申請に添付する画像の種別
export const APPLICATION_FILE_KINDS = ["受付票", "通知書", "在留カード", "その他"] as const;
export type ApplicationFileKind = (typeof APPLICATION_FILE_KINDS)[number];

export interface ApplicationFile {
  id: string;
  kind: ApplicationFileKind;
  fileName: string;
  url: string; // 署名付きURL（期限付き）
}

export interface Application {
  id: string;
  workerId: string | null; // 紐づく外国人（workers.id）。未登録者の申請は null
  workerName?: string | null; // 表示用（workers から JOIN 取得）
  name: string; // 氏名
  applicationDate: string; // 申請日 (YYYY-MM-DD)
  applicationNumber: string; // 申請番号
  applicationContent: ApplicationContent | ""; // 申請内容
  method: ApplicationMethod; // 窓口 / オンライン
  emailLink: string; // オンライン申請の受付メールのリンク
  receiptImageUrl?: string; // （旧）受付票画像URL。現在は application_files を使用
  noticeImageUrl?: string; // （旧）通知書画像URL
  residenceCardImageUrl?: string; // （旧）在留カード画像URL
  approvalDate?: string; // 許可日
  cardReceivedOn?: string; // 在留カード受領日
  withdrawnOn?: string; // 取下げ日
  approvalReported: boolean; // 許可のLINE報告済
  lineReported: boolean; // 申請のLINE報告済
  notionSynced: boolean; // Notion同期済
  approved: boolean; // 許可済
  status: ApplicationStatus;
  assignee: string; // 申請取次士
  createdAt: string; // 登録日時
  updatedAt: string; // 更新日時
  notionPageId?: string;
}
