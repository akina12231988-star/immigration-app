import { prepDocLabel, PREP_DOC_DEFS, PREP_DOC_STATUS_OPTIONS, prepStatusOption } from "@/lib/application-prep";
import { followupsOf, isKokuhoRequested, needsMoving } from "@/lib/worker-followups";

// TODO ＞ 依頼中: 誰に何を依頼していて、いつ依頼して、いまどうなっているかをまとめて見る。
//
// 1. 申請準備の書類（課税証明書・納税証明書・年金記録など）で準備状況を「〜依頼中」にしたもの。
//    発行依頼先（PREP_ISSUE_REQUEST_OPTIONS）を note に、依頼日を date_on に持つ。
//    「秋吉伽恋に発行依頼中」「本人に依頼中」のように状況の文に相手が入っているものは、そこから相手を読む。
// 2. 外国人詳細の「あとでやる手続き」（転居手続き・国保/国民年金の加入）で依頼を記録したもの。
//
// 依頼したまま止まっているものが分かるよう、依頼先ごとに並べ、依頼日からの日数を出す。

export type IssueRequestKind = "doc" | "moving" | "kokuho";

// 1件分（準備状況の1行＝外国人×TODO×書類、または手続きの依頼1件）
export interface IssueRequestRow {
  kind: IssueRequestKind;
  checklistId: string; // 手続きの依頼のときは "followup"
  docId: string; // 手続きの依頼のときは "moving" / "kokuho"
  docLabel: string; // 「令和7年度 課税証明書」「転居手続き」など
  status: string; // 選んでいる準備状況・手続きの状況
  issuer: string; // 依頼先（note）。未選択なら空
  workerId: string;
  workerName: string;
  todoNo: string;
  targetReiwa: number | null;
  done: boolean; // その準備状況が完了扱いか
  updatedAt: string;
  requestedOn: string | null; // 依頼日（入っていなければ最終更新日）
  memo: string; // 依頼中のメモ（書類は prep_doc_statuses.memo、手続きは followups の note）
}

// 発行依頼の状況。「発行依頼中」＝まだ、それ以外の完了扱い＝済み
export type IssueRequestState = "依頼中" | "完了";

export function issueRequestState(docId: string, status: string): IssueRequestState {
  return prepStatusOption(docId, status)?.done ? "完了" : "依頼中";
}

// 準備状況の文が「〜依頼中」（誰かに頼んで待っている）か
export function isRequestingStatus(status: string): boolean {
  return status.includes("依頼中");
}

// 「〜依頼中」の選択肢を持つ書類だけを対象にする（課税証明書・納税証明書・年金記録・保険証など）
export const ISSUE_REQUEST_DOC_IDS = PREP_DOC_DEFS.filter((d) =>
  (PREP_DOC_STATUS_OPTIONS[d.id] ?? []).some((o) => isRequestingStatus(o.value)),
).map((d) => d.id);

export function isIssueRequestDoc(docId: string): boolean {
  return ISSUE_REQUEST_DOC_IDS.includes(docId);
}

// 依頼先。発行依頼先の欄（note）があればそれ、無ければ状況の文（「秋吉伽恋に発行依頼中」
// 「本人に依頼中」「送り出し機関に依頼中」）から相手を読む。分からなければ空
export function issuerOf(status: string, note: string): string {
  const n = note.trim();
  if (n) return n;
  const m = /^(.+?)に(?:発行|納付を)?依頼中$/.exec(status.trim());
  return m ? m[1] : "";
}

// 「完了」にするときに入れる準備状況（その書類の完了扱いの選択肢のうち、ファイルを添付するもの）。
// 無ければ null（完了にできない）
export function doneStatusFor(docId: string): string | null {
  const opts = PREP_DOC_STATUS_OPTIONS[docId] ?? [];
  return (opts.find((o) => o.done && !o.noFile) ?? opts.find((o) => o.done))?.value ?? null;
}

// 「依頼中」に戻すときに入れる準備状況。前の状況が依頼中ならそれ、無ければ最初の依頼中の選択肢
export function requestStatusFor(docId: string, previous: string): string | null {
  if (isRequestingStatus(previous)) return previous;
  return (PREP_DOC_STATUS_OPTIONS[docId] ?? []).find((o) => isRequestingStatus(o.value))?.value ?? null;
}

// 依頼日。準備状況の依頼日（date_on）が入っていればそれ、無ければ最終更新日
export function requestedOnOf(dateOn: string | null | undefined, updatedAt: string): string | null {
  if (dateOn) return dateOn;
  return updatedAt ? updatedAt.slice(0, 10) : null;
}

// 依頼日からの経過日数（今日を含めない）。依頼日が無ければ null
export function elapsedDays(requestedOn: string | null, today: string): number | null {
  if (!requestedOn) return null;
  const a = Date.parse(`${requestedOn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// 準備状況の1行を、一覧に出す形にする。対象外の書類・依頼していないものは null
export function toIssueRequestRow(input: {
  checklistId: string;
  docId: string;
  status: string;
  note: string;
  dateOn?: string | null;
  memo?: string;
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
  const done = issueRequestState(input.docId, input.status) === "完了";
  // 依頼中でも完了でもない状況（郵送請求中など）は、この一覧の対象外
  if (!done && !isRequestingStatus(input.status)) return null;
  return {
    kind: "doc",
    checklistId: input.checklistId,
    docId: input.docId,
    docLabel: prepDocLabel(def, input.targetReiwa, input.currentReiwa),
    status: input.status,
    issuer: issuerOf(input.status, input.note),
    workerId: input.workerId,
    workerName: input.workerName,
    todoNo: input.todoNo,
    targetReiwa: input.targetReiwa,
    done,
    updatedAt: input.updatedAt,
    requestedOn: requestedOnOf(input.dateOn, input.updatedAt),
    memo: input.memo ?? "",
  };
}

// 外国人詳細の「あとでやる手続き」から、依頼してある転居手続き・国保加入を一覧の行にする。
// 転居手続きは状況が「依頼中」のもの、国保加入は依頼先か依頼日を入れたもの（残っている間だけ）
export function followupRequestRows(
  workers: { id: string; name: string; followups?: unknown }[],
): IssueRequestRow[] {
  const rows: IssueRequestRow[] = [];
  for (const w of workers) {
    const f = followupsOf(w);
    const insurance =
      f.moving.insurance_before && f.moving.insurance_after
        ? `保険証 ${f.moving.insurance_before}→${f.moving.insurance_after}`
        : "";
    // 転出手続き（転出証明書をもらう）。転出証明書が届いたら、この行は出さない
    if (needsMoving(f) && f.moving.status === "依頼中" && !f.moving.certificate_received_on) {
      rows.push({
        kind: "moving",
        checklistId: "followup",
        docId: "moving",
        docLabel: "転出手続き（転出証明書）",
        status: [
          "依頼中",
          f.moving.planned_on ? `転居予定 ${f.moving.planned_on}` : "",
          f.moving.certificate_sent_on ? `転出証明書 ${f.moving.certificate_sent_on} 郵送` : "",
          insurance,
        ]
          .filter(Boolean)
          .join("・"),
        issuer: f.moving.requested_to.trim(),
        workerId: w.id,
        workerName: w.name,
        todoNo: "",
        targetReiwa: null,
        done: false,
        updatedAt: "",
        requestedOn: f.moving.requested_on,
        memo: f.moving.note,
      });
    }
    // 転入手続き（転出証明書が届いてから別の人に頼むことがある）
    if (needsMoving(f) && f.moving.movein_status === "依頼中") {
      rows.push({
        kind: "moving",
        checklistId: "followup",
        docId: "movein",
        docLabel: "転入手続き",
        status: [
          "依頼中",
          f.moving.certificate_received_on ? `転出証明書は ${f.moving.certificate_received_on} に届いた` : "",
          f.moving.new_address ? `転入先 ${f.moving.new_address}` : "",
          insurance,
        ]
          .filter(Boolean)
          .join("・"),
        issuer: f.moving.movein_requested_to.trim(),
        workerId: w.id,
        workerName: w.name,
        todoNo: "",
        targetReiwa: null,
        done: false,
        updatedAt: "",
        requestedOn: f.moving.movein_requested_on,
        memo: f.moving.note,
      });
    }
    if (isKokuhoRequested(f)) {
      const rest = [
        f.kokuho.kokuho_done ? null : "国民健康保険",
        f.kokuho.nenkin_done ? null : "国民年金",
      ].filter((s): s is string => s !== null);
      rows.push({
        kind: "kokuho",
        checklistId: "followup",
        docId: "kokuho",
        docLabel: `${rest.join("・")}の加入`,
        status: f.kokuho.docs_ready_on
          ? `依頼中（退職書類は ${f.kokuho.docs_ready_on} に発行済み）`
          : "依頼中（退職書類の発行待ち）",
        issuer: f.kokuho.requested_to.trim(),
        workerId: w.id,
        workerName: w.name,
        todoNo: "",
        targetReiwa: null,
        done: false,
        updatedAt: "",
        requestedOn: f.kokuho.requested_on,
        memo: f.kokuho.note,
      });
    }
  }
  return rows;
}

// その行を開くリンク。書類は申請準備の詳細、手続きの依頼は外国人詳細の「あとでやる手続き」
export function issueRequestHref(r: IssueRequestRow, prepHref: (workerId: string) => string): string {
  return r.kind === "doc" ? prepHref(r.workerId) : `/workers/${r.workerId}#followups`;
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
