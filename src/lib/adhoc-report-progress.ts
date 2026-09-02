import type { ResignationStatus } from "@/types/db";

// 随時報告書の記録の進み具合。
// 退職の記録（0086_resignation_progress.sql）と契約内容変更の記録
// （0134_contract_change_posting.sql）で同じ考え方を使う。
//
//   準備中     … 届出書をまだ作っていない
//   署名依頼中 … 届出書を作成（ダウンロード）して、会社・本人の署名を待っている
//   投函完了   … 署名済みの届出書をスキャンして添付し、追跡番号と投函日を入れた
//
// 0086 より前の退職の記録は status が入っていないので、投函日・様式の作成日時から
// 見当をつけて表示する（画面が空白にならないようにする）。

// 進み具合の判定に使う項目（退職・契約内容変更のどちらの記録も同じ名前で持つ）
export interface AdhocProgressFields {
  status?: ResignationStatus;
  posted_on?: string | null;
  tracking_no?: string;
  forms_downloaded_at?: string | null;
}

export function adhocReportStatus(r: AdhocProgressFields): ResignationStatus {
  if (r.status) return r.status;
  if (r.posted_on) return "投函完了";
  return r.forms_downloaded_at ? "署名依頼中" : "準備中";
}

// 「投函完了」にできる条件: スキャンの添付・追跡番号・投函日がそろっている
export function canCompletePosting(
  r: Pick<AdhocProgressFields, "posted_on" | "tracking_no">,
  fileCount: number,
): boolean {
  return !!r.posted_on && !!(r.tracking_no ?? "").trim() && fileCount > 0;
}

// まだ足りないものの案内（そろっていれば空）
export function postingMissingLabel(
  r: Pick<AdhocProgressFields, "posted_on" | "tracking_no">,
  fileCount: number,
): string {
  const missing = [
    fileCount > 0 ? "" : "署名済み届出書のスキャン",
    (r.tracking_no ?? "").trim() ? "" : "レターパックの追跡番号",
    r.posted_on ? "" : "投函日",
  ].filter(Boolean);
  return missing.length === 0 ? "" : `あと ${missing.join("・")} を入れると投函完了になります`;
}

// 様式をダウンロードしたときの新しい進み具合（準備中のときだけ署名依頼中にする）
export function statusAfterFormDownload(r: AdhocProgressFields): ResignationStatus | null {
  return adhocReportStatus(r) === "準備中" ? "署名依頼中" : null;
}

export function countByAdhocStatus(
  rows: AdhocProgressFields[],
): Record<ResignationStatus, number> {
  const counts: Record<ResignationStatus, number> = {
    準備中: 0,
    署名依頼中: 0,
    投函完了: 0,
  };
  for (const r of rows) counts[adhocReportStatus(r)] += 1;
  return counts;
}
