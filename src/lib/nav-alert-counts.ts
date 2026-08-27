import { isPassportRenewalListTarget } from "@/lib/worker-alerts";
import { hasFollowup } from "@/lib/worker-followups";

// メニューのバッジに出す件数の数え方。
// パスポート更新必要と、あとでやる手続きは、どちらも workers を丸ごと見るので
// 1回の取得から両方を数える（同じ表を2回読まないため）。

// メニューの件数に必要な項目だけ
export interface NavAlertWorker {
  support: string;
  status: string;
  passport_expiry_date: string | null;
  followups?: unknown; // 0119 が未適用のときは undefined
}

// パスポート更新必要の人数（パスポート更新必要のページと同じ判定）。
// 有効期限が未登録の人は isPassportRenewalListTarget が対象外にするので、
// 取得のときに絞り込まなくても件数は変わらない。
export function countPassportAlerts(workers: NavAlertWorker[], today: string): number {
  return workers.filter((w) =>
    isPassportRenewalListTarget(
      w as Parameters<typeof isPassportRenewalListTarget>[0],
      today,
    ),
  ).length;
}

// あとでやる手続き（転居手続き・国保/国民年金の加入）が残っている人数。
// 退職した人は数えない（外国人一覧の絞り込みと同じ扱い）。
export function countFollowupAlerts(workers: NavAlertWorker[]): number {
  return workers.filter((w) => w.status !== "退職" && hasFollowup(w)).length;
}
