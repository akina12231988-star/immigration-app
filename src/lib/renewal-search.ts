// 申請準備の一覧を「外国人の氏名」で探すための小さな検索ヘルパー。
// 氏名（ローマ字・漢字）とふりがなの両方で部分一致する。
import type { WorkerWithOrg } from "@/lib/supabase/queries/workers";
import { isResidenceRenewalTarget, RESIDENCE_RENEWAL_MONTHS } from "@/lib/worker-alerts";

export interface SearchableWorker {
  name: string;
  kana?: string | null;
}

// 検索用の正規化: 空白（半角・全角）を除き、小文字にそろえる。
// 「NGUYEN VAN A」を「nguyenvana」でも探せるようにするため。
export function normalizeSearchText(text: string): string {
  return text.replace(/[\s　]/g, "").toLowerCase();
}

// 氏名またはふりがなに、入力した文字が含まれるか
export function matchesWorkerName(worker: SearchableWorker, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  return [worker.name, worker.kana ?? ""].some((t) => normalizeSearchText(t).includes(q));
}

// 入力に応じた候補。前方一致を先に、そのあと五十音順で最大 limit 件。
export function workerNameSuggestions<T extends SearchableWorker>(
  workers: T[],
  query: string,
  limit = 8,
): T[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const rank = (w: T) => (normalizeSearchText(w.name).startsWith(q) ? 0 : 1);
  return workers
    .filter((w) => matchesWorkerName(w, query))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ja"))
    .slice(0, limit);
}

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
