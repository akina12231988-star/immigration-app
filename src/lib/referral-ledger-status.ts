// 求職一覧で「採用なのに紹介手数料台帳へまだ追加していない応募」を見つけるための判定。
//
// 台帳（referral_fees）の行は、求職一覧の「紹介手数料台帳に追加」から足すと
// 応募（job_application_id）と紐づく。
// 一方、手数料管理簿の画面から直接足した行は応募と紐づいていないため、
// 紐づきだけを見ると、台帳に載っている人まで「未追加」に見えてしまう。
// そこで、紐づいていない行は「外国人＋所属機関」の組み合わせで照らし合わせ、
// 同じ組み合わせがあれば未追加とは数えない（同じ紹介を二重に台帳へ入れないため）。

export type ReferralLedgerStatus =
  | "追加済み" // この応募と紐づく台帳の行がある
  | "別行あり" // 紐づいてはいないが、同じ人・同じ会社の行が台帳にある
  | "未追加" // 台帳に見当たらない（採用なのに手つかず）
  | "対象外"; // 採用ではないので、台帳に載せる応募ではない

// 判定に使う応募の項目だけ
export interface ReferralLedgerRow {
  id: string;
  worker_id: string;
  organization_id: string;
  result: string;
}

// 応募と紐づいていない台帳の行を照らし合わせるための鍵（外国人＋所属機関）
export function referralWorkerOrgKey(
  workerId: string | null,
  organizationId: string | null,
): string {
  return `${workerId ?? ""}|${organizationId ?? ""}`;
}

// 1件の応募が、紹介手数料台帳のどの状態か
export function referralLedgerStatus(
  row: ReferralLedgerRow,
  linkedByApplication: Record<string, unknown>,
  unlinkedKeys: ReadonlySet<string>,
): ReferralLedgerStatus {
  if (row.result !== "採用") return "対象外";
  if (linkedByApplication[row.id]) return "追加済み";
  if (unlinkedKeys.has(referralWorkerOrgKey(row.worker_id, row.organization_id))) {
    return "別行あり";
  }
  return "未追加";
}

// 「紹介手数料台帳に未追加」で絞り込むときの判定
export function isMissingFromReferralLedger(
  row: ReferralLedgerRow,
  linkedByApplication: Record<string, unknown>,
  unlinkedKeys: ReadonlySet<string>,
): boolean {
  return referralLedgerStatus(row, linkedByApplication, unlinkedKeys) === "未追加";
}

// 未追加の件数（絞り込みのボタンに出す）
export function countMissingFromReferralLedger<T extends ReferralLedgerRow>(
  rows: readonly T[],
  linkedByApplication: Record<string, unknown>,
  unlinkedKeys: ReadonlySet<string>,
): number {
  return rows.filter((r) => isMissingFromReferralLedger(r, linkedByApplication, unlinkedKeys))
    .length;
}
