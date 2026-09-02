// 申請一覧に出す「預かり番号」の引き当て。
//
// 預かり（保管ボックス）は外国人に紐づくが、申請の側は外国人と紐づいていない
// ことがある（申請登録で氏名だけ入れて登録した場合など）。そのときでも
// ボックスに入っていれば番号が出るように、氏名でも照合する。
// 同姓同名が複数いて特定できないときは、間違った番号を出さずに空にする。

export interface ActiveCustodyRow {
  worker_id: string;
  worker_name: string;
  storage_no: number;
}

export interface CustodyNoIndex {
  byWorkerId: Map<string, number>;
  // 氏名 → 番号。null は同姓同名が複数いて特定できない
  byName: Map<string, number | null>;
}

// 氏名の表記ゆれ（全角・半角、余分な空白、大文字小文字）を吸収する
export function normalizeWorkerName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
}

// 預かり中（返却済み以外）の一覧から、外国人IDと氏名の索引を作る。
// 1人が複数の番号を持つときは小さい番号を採用する（保管ボックスの表示と同じ）。
export function buildCustodyNoIndex(rows: ActiveCustodyRow[]): CustodyNoIndex {
  const sorted = [...rows].sort((a, b) => a.storage_no - b.storage_no);
  const byWorkerId = new Map<string, number>();
  const byName = new Map<string, number | null>();
  const nameOwner = new Map<string, string>(); // 氏名 → 先に見つけた外国人ID

  for (const r of sorted) {
    if (!r.worker_id) continue;
    if (!byWorkerId.has(r.worker_id)) byWorkerId.set(r.worker_id, r.storage_no);

    const key = normalizeWorkerName(r.worker_name ?? "");
    if (!key) continue;
    const owner = nameOwner.get(key);
    if (owner === undefined) {
      nameOwner.set(key, r.worker_id);
      byName.set(key, r.storage_no);
    } else if (owner !== r.worker_id) {
      // 同姓同名が別人として預かり中。どちらの番号か決められない
      byName.set(key, null);
    }
  }
  return { byWorkerId, byName };
}

// 申請1件ぶんの預かり番号。見つからなければ null。
// 外国人が紐づいていればそれで引き、駄目なら申請者の氏名で照合する。
export function findCustodyNo(
  index: CustodyNoIndex,
  workerId: string | null | undefined,
  applicantName: string,
): number | null {
  if (workerId) {
    const no = index.byWorkerId.get(workerId);
    if (no != null) return no;
  }
  const key = normalizeWorkerName(applicantName ?? "");
  if (!key) return null;
  return index.byName.get(key) ?? null;
}
