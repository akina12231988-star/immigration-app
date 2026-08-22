import type { Application, ApplicationStatus } from "@/types/application";

// 申請の流れの途中の状態。
// 申請済〜通知書到着＝審査中、許可済＝在留カード受け取り待ち。
// この間の外国人は、いま申請準備をする段階ではないため対象から除外する。
// 在留カード受領まで進む（または取下げる）と、次の更新の準備対象に戻る。
export const UNDER_REVIEW_STATUSES: ApplicationStatus[] = [
  "申請済",
  "LINE報告済",
  "通知書到着",
  "許可済",
];

// 申請の流れの途中（審査中・在留カード受け取り待ち）の申請を持つ外国人IDの一覧
export function underReviewWorkerIds(applications: Application[]): string[] {
  return [
    ...new Set(
      applications
        .filter((a) => a.workerId && UNDER_REVIEW_STATUSES.includes(a.status))
        .map((a) => a.workerId as string),
    ),
  ];
}
