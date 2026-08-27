import { prepDocLabel, PREP_DOC_DEFS, prepStatusOption } from "@/lib/application-prep";

// 「発行依頼中」の書類を、誰に依頼したかでまとめて見るための集計。
//
// 課税証明書・納税証明書などの準備状況を「発行依頼中」にすると、
// 発行依頼先（PREP_ISSUE_REQUEST_OPTIONS）を note に持つ。
// 依頼したまま止まっているものが分かるよう、依頼先ごとに並べる。

// 1件分（準備状況の1行＝外国人×TODO×書類）
export interface IssueRequestRow {
  checklistId: string;
  docId: string;
  docLabel: string; // 「令和7年度 課税証明書」など
  status: string; // 選んでいる準備状況
  issuer: string; // 発行依頼先（note）。未選択なら空
  workerId: string;
  workerName: string;
  todoNo: string;
  targetReiwa: number | null;
  done: boolean; // その準備状況が完了扱いか
  updatedAt: string;
}

// 発行依頼の状況。「発行依頼中」＝まだ、それ以外の完了扱い＝済み
export type IssueRequestState = "依頼中" | "完了";

export function issueRequestState(docId: string, status: string): IssueRequestState {
  return prepStatusOption(docId, status)?.done ? "完了" : "依頼中";
}

// 「発行依頼中」の選択肢を持つ書類だけを対象にする（課税証明書・納税証明書など）
export const ISSUE_REQUEST_DOC_IDS = PREP_DOC_DEFS.filter((d) =>
  Boolean(prepStatusOption(d.id, "発行依頼中")),
).map((d) => d.id);

export function isIssueRequestDoc(docId: string): boolean {
  return ISSUE_REQUEST_DOC_IDS.includes(docId);
}

// 準備状況の1行を、一覧に出す形にする。対象外の書類・未依頼のものは null
export function toIssueRequestRow(input: {
  checklistId: string;
  docId: string;
  status: string;
  note: string;
  updatedAt: string;
  workerId: string;
  workerName: string;
  todoNo: string;
  targetReiwa: number | null;
  currentReiwa: number;
}): IssueRequestRow | null {
  if (!isIssueRequestDoc(input.docId)) return null;
  const def = PREP_DOC_DEFS.find((d) => d.id === input.docId);
  if (!def) return null;
  // 何も選んでいないものは「依頼していない」ので出さない
  if (!input.status) return null;
  return {
    checklistId: input.checklistId,
    docId: input.docId,
    docLabel: prepDocLabel(def, input.targetReiwa, input.currentReiwa),
    status: input.status,
    issuer: input.note.trim(),
    workerId: input.workerId,
    workerName: input.workerName,
    todoNo: input.todoNo,
    targetReiwa: input.targetReiwa,
    done: issueRequestState(input.docId, input.status) === "完了",
    updatedAt: input.updatedAt,
  };
}

// 依頼先ごとにまとめる。依頼先が未選択のものは最後に「（依頼先が未選択）」として置く
export interface IssuerGroup {
  issuer: string; // 空文字 = 未選択
  pending: IssueRequestRow[]; // まだ発行されていない
  done: IssueRequestRow[]; // 発行完了
}

export const NO_ISSUER_LABEL = "（依頼先が未選択）";

export function groupByIssuer(rows: IssueRequestRow[]): IssuerGroup[] {
  const byIssuer = new Map<string, IssueRequestRow[]>();
  for (const r of rows) {
    const key = r.issuer;
    byIssuer.set(key, [...(byIssuer.get(key) ?? []), r]);
  }
  return [...byIssuer.entries()]
    .map(([issuer, list]) => ({
      issuer,
      pending: list.filter((r) => !r.done).sort(sortByWorkerThenDoc),
      done: list.filter((r) => r.done).sort(sortByWorkerThenDoc),
    }))
    // 依頼先が入っているものを先に、その中では残っている件数が多い順
    .sort((a, b) => {
      if (!a.issuer !== !b.issuer) return a.issuer ? -1 : 1;
      if (a.pending.length !== b.pending.length) return b.pending.length - a.pending.length;
      return a.issuer.localeCompare(b.issuer, "ja");
    });
}

function sortByWorkerThenDoc(a: IssueRequestRow, b: IssueRequestRow): number {
  return a.workerName === b.workerName
    ? a.docLabel.localeCompare(b.docLabel, "ja")
    : a.workerName.localeCompare(b.workerName, "ja");
}

// 見出しに出す件数
export function issueRequestSummary(rows: IssueRequestRow[]): {
  pending: number;
  done: number;
  noIssuer: number;
} {
  return {
    pending: rows.filter((r) => !r.done).length,
    done: rows.filter((r) => r.done).length,
    // 依頼中なのに依頼先が入っていないもの（誰に頼んだか分からない）
    noIssuer: rows.filter((r) => !r.done && !r.issuer).length,
  };
}
