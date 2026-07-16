import type { Application } from "@/types/application";

// ダッシュボードの集計と、一覧の「カードから開く絞り込み」で同じ条件を共有する
export const STAT_VIEWS = {
  "this-month": {
    label: "今月の申請",
    test: (a: Application) => {
      const d = new Date(a.applicationDate);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    },
  },
  unreported: {
    label: "LINE未報告",
    test: (a: Application) =>
      !a.lineReported && a.status !== "申請前" && a.status !== "取下げ",
  },
  "waiting-notice": {
    label: "現在審査中",
    test: (a: Application) =>
      a.lineReported &&
      !a.approved &&
      a.status !== "通知書到着" &&
      a.status !== "取下げ",
  },
  approved: {
    label: "在留カード受取待ち",
    test: (a: Application) => a.approved,
  },
} as const;

export type StatViewKey = keyof typeof STAT_VIEWS;

export function isStatViewKey(v: string | null): v is StatViewKey {
  return v !== null && v in STAT_VIEWS;
}

export function getDashboardStats(applications: Application[]) {
  return {
    thisMonthCount: applications.filter(STAT_VIEWS["this-month"].test).length,
    unreportedCount: applications.filter(STAT_VIEWS.unreported.test).length,
    waitingNoticeCount: applications.filter(STAT_VIEWS["waiting-notice"].test)
      .length,
    approvedCount: applications.filter(STAT_VIEWS.approved.test).length,
  };
}
