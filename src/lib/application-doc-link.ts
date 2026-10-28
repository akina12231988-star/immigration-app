// 申請詳細の許可情報と、外国人詳細の在留カード・指定書の画像の紐づけ。
//
// 画像の保存先は2つある。
//   ・application_files … 申請詳細の許可情報で登録した画像（申請ごと）
//   ・worker_documents  … 外国人詳細の在留カード・指定書で登録した画像（外国人ごと）
// どちらで登録しても両方の画面に出るように、
//   ・外国人詳細は、その人の全申請の在留カード・照合結果・指定書を履歴に含める（登録日で期間に振り分ける）
//   ・申請詳細は、その申請の許可の期間（許可日から次の許可日の前日まで）に外国人詳細で登録した画像を含める
// ここはその「申請の許可の期間」の判定（純粋な計算。テストあり）。

// 紐づける書類の種別（在留カード・照合結果・指定書）
export const LINKED_DOC_KINDS = ["在留カード", "照合結果", "指定書"] as const;
export type LinkedDocKind = (typeof LINKED_DOC_KINDS)[number];

export interface DocLinkApp {
  id: string;
  applicationDate: string; // 申請日 YYYY-MM-DD
  grantedPermitDate?: string | null; // 在留許可日
  approvalDate?: string | null; // 許可日（フロー用）
  withdrawnOn?: string | null; // 取下げ日
}

// その申請の許可の期間。start 以上 end 未満（end が null なら上限なし）
export interface DocWindow {
  start: string; // 在留許可日 → 許可日 → 申請日 の順で最初にあるもの
  end: string | null; // 次の許可（同じ外国人の、申請日がこの申請より後で許可日が入っている申請）の許可日
}

// 申請の「許可の日」（在留許可日 → 許可日 の順。無ければ null）
export function permitDateOf(app: Pick<DocLinkApp, "grantedPermitDate" | "approvalDate">): string | null {
  return app.grantedPermitDate || app.approvalDate || null;
}

// この申請に紐づける画像の期間を出す。others は同じ外国人の申請（この申請を含んでいてもよい）
export function applicationDocWindow(app: DocLinkApp, others: DocLinkApp[]): DocWindow {
  const start = permitDateOf(app) || app.applicationDate;
  const next = others
    .filter(
      (o) =>
        o.id !== app.id &&
        !o.withdrawnOn &&
        o.applicationDate > app.applicationDate &&
        permitDateOf(o) !== null,
    )
    .sort((a, b) => a.applicationDate.localeCompare(b.applicationDate))[0];
  const end = next ? permitDateOf(next) : null;
  // 次の許可日が開始より前（入力の食い違い）なら上限を付けない
  return { start, end: end && end > start ? end : null };
}

// 画像の登録日（YYYY-MM-DD）がその期間に入るか
export function isDocInWindow(docDate: string, w: DocWindow): boolean {
  if (!docDate || docDate < w.start) return false;
  return w.end === null || docDate < w.end;
}

export function isLinkedDocKind(kind: string): kind is LinkedDocKind {
  return (LINKED_DOC_KINDS as readonly string[]).includes(kind);
}
