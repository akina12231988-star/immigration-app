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

// 入管で審査中（申請済〜通知書到着で、まだ許可にも取下げにもなっていない）の申請。
// 外国人管理の一覧に青い「審査中」のバッジを出すのに使う（許可済＝在留カード受け取り待ちは含めない）
export function isInReviewApplication(a: Pick<Application, "status" | "approved" | "withdrawnOn">): boolean {
  return (
    (a.status === "申請済" || a.status === "LINE報告済" || a.status === "通知書到着") &&
    !a.approved &&
    !a.withdrawnOn
  );
}

// 入管で審査中の申請を持つ外国人IDの一覧
export function inReviewWorkerIds(applications: Application[]): string[] {
  return [...new Set(applications.filter((a) => a.workerId && isInReviewApplication(a)).map((a) => a.workerId as string))];
}

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

// 青い「審査中」のバッジを出すか（外国人管理の一覧のカードと、外国人詳細の見出しで同じ判定）。
//  ・入管で審査中の申請がある
//  ・在留更新の状況が「審査中」
//  ・只今の状況（経過メモ。未入力なら自動表示の文）に「審査中」と書いてある
export function isWorkerInReview(
  worker: { residence_renewal_status?: string | null; current_situation?: string | null },
  situationShown: string, // 画面に出ている只今の状況（入力があればそれ、無ければ自動表示の文）
  hasInReviewApplication: boolean, // 入管で審査中の申請があるか
): boolean {
  if (hasInReviewApplication) return true;
  if (worker.residence_renewal_status === "審査中") return true;
  return /審査中/.test(situationShown || worker.current_situation || "");
}

// 外国人詳細の見出しに青い「審査中」を出すか（その人の申請の一覧から判定する）
export function workerShowsInReview(
  worker: { residence_renewal_status?: string | null; current_situation?: string | null },
  situationShown: string,
  applications: Pick<Application, "status" | "approved" | "withdrawnOn">[],
): boolean {
  return isWorkerInReview(worker, situationShown, applications.some(isInReviewApplication));
}

// 外国人ごとのいちばん新しい申請（只今の状況の自動表示に使う）。
// 申請の一覧は申請日の新しい順なので、最初に出てきたものがその人の最新
export function latestApplicationByWorker(
  applications: Pick<Application, "workerId" | "status" | "applicationContent">[],
): Record<string, { status: string; applicationContent: string }> {
  const out: Record<string, { status: string; applicationContent: string }> = {};
  for (const a of applications) {
    if (!a.workerId || out[a.workerId]) continue;
    out[a.workerId] = { status: a.status, applicationContent: a.applicationContent ?? "" };
  }
  return out;
}
