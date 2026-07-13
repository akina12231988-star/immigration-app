import type { Application } from "@/types/application";

// ダッシュボードのサマリー集計（旧 mock-data.ts から移設。データは Supabase 由来）
export function getDashboardStats(applications: Application[]) {
  const now = new Date();
  const thisMonthCount = applications.filter((a) => {
    const d = new Date(a.applicationDate);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  }).length;

  const unreportedCount = applications.filter(
    (a) => !a.lineReported && a.status !== "申請前" && a.status !== "取下げ"
  ).length;

  const waitingNoticeCount = applications.filter(
    (a) =>
      a.lineReported &&
      !a.approved &&
      a.status !== "通知書到着" &&
      a.status !== "取下げ"
  ).length;

  const approvedCount = applications.filter((a) => a.approved).length;

  return { thisMonthCount, unreportedCount, waitingNoticeCount, approvedCount };
}
