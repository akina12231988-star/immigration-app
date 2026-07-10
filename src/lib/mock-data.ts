import type { Application } from "@/types/application";

// Stage2 画面デザイン確認用のダミーデータ。Stage4でSheets実データ取得に置き換える。
export const MOCK_APPLICATIONS: Application[] = [
  {
    id: "1",
    name: "グエン・ヴァン・A",
    applicationDate: "2026-07-06",
    applicationNumber: "123456",
    applicationContent: "在留期間の更新許可",
    applicationMethod: "窓口申請",
    receiptImageUrl: undefined,
    lineReported: false,
    notionSynced: false,
    approved: false,
    status: "申請済",
    assignee: "田中",
    createdAt: "2026-07-06T09:12:00+09:00",
    updatedAt: "2026-07-06T09:12:00+09:00",
  },
  {
    id: "2",
    name: "チャン・ティ・B",
    applicationDate: "2026-07-04",
    applicationNumber: "123401",
    applicationContent: "在留期間の更新許可",
    applicationMethod: "オンライン申請",
    emailLink: "https://myna.go.jp/notify/sample",
    emailBody:
      "入管オンラインシステムより届いた受付確認メールの本文サンプルです。",
    lineReported: true,
    notionSynced: true,
    approved: false,
    status: "LINE報告済",
    assignee: "佐藤",
    createdAt: "2026-07-04T10:30:00+09:00",
    updatedAt: "2026-07-05T14:00:00+09:00",
  },
  {
    id: "3",
    name: "パク・ジミン",
    applicationDate: "2026-06-28",
    applicationNumber: "122980",
    applicationContent: "在留資格の変更許可",
    applicationMethod: "窓口申請",
    lineReported: true,
    notionSynced: true,
    approved: false,
    status: "通知書到着",
    assignee: "田中",
    createdAt: "2026-06-28T11:00:00+09:00",
    updatedAt: "2026-07-03T09:00:00+09:00",
  },
  {
    id: "4",
    name: "リー・ミン",
    applicationDate: "2026-06-15",
    applicationNumber: "122500",
    applicationContent: "在留資格の変更許可",
    applicationMethod: "窓口申請",
    approvalDate: "2026-07-01",
    lineReported: true,
    notionSynced: true,
    approved: true,
    status: "許可済",
    assignee: "鈴木",
    createdAt: "2026-06-15T09:00:00+09:00",
    updatedAt: "2026-07-01T13:20:00+09:00",
  },
  {
    id: "5",
    name: "ソムチャイ・K",
    applicationDate: "2026-07-06",
    applicationNumber: "",
    applicationContent: "在留認定許可申請",
    applicationMethod: "窓口申請",
    lineReported: false,
    notionSynced: false,
    approved: false,
    status: "申請前",
    assignee: "佐藤",
    createdAt: "2026-07-06T08:00:00+09:00",
    updatedAt: "2026-07-06T08:00:00+09:00",
  },
];

// ダッシュボードのカード集計と、そのカードから遷移する一覧画面の絞り込みの
// 両方で同じ判定ロジックを使い回すための述語関数群。
export const DASHBOARD_FILTER_KEYS = [
  "thisMonth",
  "unreported",
  "waitingNotice",
  "approved",
] as const;

export type DashboardFilterKey = (typeof DASHBOARD_FILTER_KEYS)[number];

export const DASHBOARD_FILTER_LABELS: Record<DashboardFilterKey, string> = {
  thisMonth: "今月申請件数",
  unreported: "未報告件数",
  waitingNotice: "通知書待ち件数",
  approved: "許可済件数",
};

export function matchesDashboardFilter(
  a: Application,
  key: DashboardFilterKey,
  now: Date = new Date()
): boolean {
  switch (key) {
    case "thisMonth": {
      const d = new Date(a.applicationDate);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      );
    }
    case "unreported":
      return !a.lineReported && a.status !== "申請前";
    case "waitingNotice":
      return a.lineReported && !a.approved && a.status !== "通知書到着";
    case "approved":
      return a.approved;
    default:
      return false;
  }
}

export function getDashboardStats(applications: Application[]) {
  const now = new Date();
  const counts = {} as Record<DashboardFilterKey, number>;
  for (const key of DASHBOARD_FILTER_KEYS) {
    counts[key] = applications.filter((a) =>
      matchesDashboardFilter(a, key, now)
    ).length;
  }
  return {
    thisMonthCount: counts.thisMonth,
    unreportedCount: counts.unreported,
    waitingNoticeCount: counts.waitingNotice,
    approvedCount: counts.approved,
  };
}
