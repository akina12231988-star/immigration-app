import type { Application } from "@/types/application";

// Stage2 画面デザイン確認用のダミーデータ。Stage4でSheets実データ取得に置き換える。
export const MOCK_APPLICATIONS: Application[] = [
  {
    id: "1",
    name: "グエン・ヴァン・A",
    applicationDate: "2026-07-06",
    applicationNumber: "123456",
    applicationContent: "在留期間の更新許可",
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
    lineReported: false,
    notionSynced: false,
    approved: false,
    status: "申請前",
    assignee: "佐藤",
    createdAt: "2026-07-06T08:00:00+09:00",
    updatedAt: "2026-07-06T08:00:00+09:00",
  },
];

export function getDashboardStats(applications: Application[]) {
  const now = new Date();
  const thisMonthCount = applications.filter((a) => {
    const d = new Date(a.applicationDate);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  }).length;

  const unreportedCount = applications.filter(
    (a) => !a.lineReported && a.status !== "申請前"
  ).length;

  const waitingNoticeCount = applications.filter(
    (a) => a.lineReported && !a.approved && a.status !== "通知書到着"
  ).length;

  const approvedCount = applications.filter((a) => a.approved).length;

  return { thisMonthCount, unreportedCount, waitingNoticeCount, approvedCount };
}
