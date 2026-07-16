import type { Application, ApplicationStatus } from "@/types/application";

// 申請済〜通知書到着＝現在審査中（申請中）。この間の外国人は在留更新対象から除外する。
export const UNDER_REVIEW_STATUSES: ApplicationStatus[] = [
  "申請済",
  "LINE報告済",
  "通知書到着",
];

// 現在審査中（申請中）の申請を持つ外国人IDの一覧
export function underReviewWorkerIds(applications: Application[]): string[] {
  return [
    ...new Set(
      applications
        .filter((a) => a.workerId && UNDER_REVIEW_STATUSES.includes(a.status))
        .map((a) => a.workerId as string),
    ),
  ];
}
