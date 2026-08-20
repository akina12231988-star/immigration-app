// 申請準備の一覧で、探した人が出てこない理由を出すためのヘルパー。
// 氏名の検索そのものは worker-search.ts にある。
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { isResidenceRenewalTarget, RESIDENCE_RENEWAL_MONTHS } from "@/lib/worker-alerts";

export type PrepMode = "新規" | "更新";

export type OffListWorker = Pick<
  WorkerWithOrg,
  "id" | "name" | "kana" | "status" | "residence_expiry_date" | "application_prep_kind"
>;

// 探した人が申請準備の一覧に出てこないとき、その理由を日本語で返す。
// 一覧に出る人（＝理由が無い人）は null。
export function offListReason(
  worker: OffListWorker,
  opts: { today: string; underReview: boolean; mode: PrepMode },
): string | null {
  const { today, underReview, mode } = opts;
  if (worker.status === "退職") return "退職された方のため、申請準備の対象外です。";
  if (underReview) return "いま申請中（審査中）のため、申請準備の一覧には出ません。";
  if (mode === "新規") {
    if (worker.application_prep_kind !== "新規") {
      return "「更新で申請書類準備」の対象です。準備の種類を選び直して「更新」から確認できます。";
    }
    return null;
  }
  if (worker.application_prep_kind === "新規") {
    return "「新規で申請書類準備」に登録済みです。準備の種類を選び直して「新規」から確認できます。";
  }
  if (!worker.residence_expiry_date) {
    return "在留期限が未登録のため、更新の対象者として出せません。外国人詳細で在留期限を登録してください。";
  }
  if (!isResidenceRenewalTarget(worker, today)) {
    return `在留期限（${worker.residence_expiry_date}）が${RESIDENCE_RENEWAL_MONTHS}か月より先のため、まだ一覧に出ません。下の期間検索で期間を指定すると表示できます。`;
  }
  return null;
}
