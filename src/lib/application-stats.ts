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
    // 受領済みは「在留カード新規発行済み」タブで表示するため、ここでは除外する
    test: (a: Application) => a.approved && a.status !== "在留カード受領",
  },
  // 在留カード受領完了＝新規発行済み。受領済みの人を絞り込む
  "card-issued": {
    label: "在留カード新規発行済み",
    test: (a: Application) => a.status === "在留カード受領",
  },
} as const;

export type StatViewKey = keyof typeof STAT_VIEWS;

export function isStatViewKey(v: string | null): v is StatViewKey {
  return v !== null && v in STAT_VIEWS;
}

// 申請前＜入管提出！！＞の実レコード件数（「申請前」かつ在留更新が準備中）。
// ダッシュボードでは buildRenewalPlaceholders の擬似行の件数を足して、
// 申請一覧の「申請前＜入管提出！！＞」タブと同じ件数を表示する
export function countPrePrepApplications(applications: Application[]): number {
  return applications.filter(
    (a) => a.status === "申請前" && a.workerRenewalStatus === "準備中",
  ).length;
}

export function getDashboardStats(applications: Application[]) {
  return {
    unreportedCount: applications.filter(STAT_VIEWS.unreported.test).length,
    waitingNoticeCount: applications.filter(STAT_VIEWS["waiting-notice"].test)
      .length,
    approvedCount: applications.filter(STAT_VIEWS.approved.test).length,
  };
}
