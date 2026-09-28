import {
  PREP_DOC_DEFS,
  evaluatePrepChecklist,
  prepDocLabel,
  type PrepChecklistMeta,
  type PrepDocSources,
} from "@/lib/application-prep";
import { isRequestingStatus, issuerOf } from "@/lib/issue-requests";

// ---- まだ揃っていない書類（申請準備の詳細を、外国人をまたいで1つの表にする） ----
//
// 申請準備の詳細は1人分しか見えないため、「推薦状は誰と誰がまだなのか」のような
// 見方ができなかった。ここでは必要書類のうち完了していないものを1行ずつにして、
//   ・何（書類）
//   ・誰の分（外国人・所属機関）
//   ・誰にいつ依頼したか（発行依頼先・依頼日）
//   ・いまどんな状況か（準備状況・添付の有無・メモ）
// を並べ、書類別／外国人別／所属機関別／依頼先別にまとめたり、組み合わせてしぼったりできるようにする。

// 書類1件分の準備状況（prep_doc_statuses の必要な列だけ）
export interface PrepDocStatusDetail {
  status: string; // 選んでいる準備状況（'' = 未選択）
  note: string; // 発行依頼先（誰に依頼したか）
  dateOn: string | null; // 依頼日（受診日を使う書類もある）
  memo: string; // 依頼中のメモ
}

export const EMPTY_PREP_DOC_STATUS_DETAIL: PrepDocStatusDetail = {
  status: "",
  note: "",
  dateOn: null,
  memo: "",
};

// 一覧の1行（外国人×書類）
export interface PrepMissingRow {
  workerId: string;
  workerName: string;
  orgId: string; // 所属機関が未登録なら空文字
  orgName: string; // 所属機関が未登録なら空文字
  todoNo: string;
  checklistId: string;
  appType: string; // 申請種別（変更・更新・認定・特定活動）
  appContent: string; // 申請の内容（準備の内容）
  tantou: string; // 申請準備の担当者
  docId: string;
  docLabel: string; // 年度つきの表示名（令和7年度 課税証明書 など）
  docBaseLabel: string; // 年度なしの表示名（書類別にまとめるときの見出し）
  status: string; // 準備状況（'' = 未選択）
  hasFile: boolean; // ファイルの添付・登録があるか（あるのに完了にしていない、が分かる）
  issuer: string; // 依頼先（'' = 依頼していない・未入力）
  requesting: boolean; // 準備状況が「〜依頼中」か
  requestedOn: string | null; // 依頼日
  memo: string;
}

// 外国人1人分の入力
export interface PrepMissingWorkerInput {
  workerId: string;
  workerName: string;
  orgId: string | null;
  orgName: string;
  todoNo: string;
  checklistId: string;
  meta: PrepChecklistMeta;
  nationality: string;
  sources: PrepDocSources;
  docStatuses: Record<string, PrepDocStatusDetail>;
  currentReiwa: number;
}

// 準備状況が未選択のときに出す文言
export const PREP_MISSING_NO_STATUS = "未着手（準備状況が未選択）";

// しぼり込みで「未登録・未入力」を選ぶときの値（実在の名前と混ざらないようにする）
export const PREP_MISSING_NONE = "__none__";

// その外国人の、まだ揃っていない書類を行にする
export function prepMissingRowsOf(input: PrepMissingWorkerInput): PrepMissingRow[] {
  const statusValues: Record<string, string> = {};
  for (const [docId, d] of Object.entries(input.docStatuses)) statusValues[docId] = d.status;
  const { missing } = evaluatePrepChecklist(
    input.meta,
    input.sources,
    statusValues,
    input.nationality,
  );
  return missing.map((item) => {
    const ds = input.docStatuses[item.def.id] ?? EMPTY_PREP_DOC_STATUS_DETAIL;
    return {
      workerId: input.workerId,
      workerName: input.workerName,
      orgId: input.orgId ?? "",
      orgName: input.orgName,
      todoNo: input.todoNo,
      checklistId: input.checklistId,
      appType: input.meta.app_type ?? "",
      appContent: input.meta.app_content ?? "",
      tantou: input.meta.tantou ?? "",
      docId: item.def.id,
      docLabel: prepDocLabel(item.def, input.meta.target_reiwa, input.currentReiwa),
      docBaseLabel: item.def.label,
      status: ds.status,
      hasFile: item.fileSatisfied,
      issuer: issuerOf(ds.status, ds.note),
      requesting: isRequestingStatus(ds.status),
      requestedOn: ds.dateOn,
      memo: ds.memo,
    };
  });
}

// 画面に出す状況の文（準備状況が未選択なら「未着手」）
export function prepMissingStatusText(row: PrepMissingRow): string {
  return row.status || PREP_MISSING_NO_STATUS;
}

// ---- まとめ方（書類別・外国人別・所属機関別・依頼先別） ----

export type PrepMissingGroupBy = "doc" | "worker" | "org" | "tantou" | "issuer";

export const PREP_MISSING_GROUP_LABELS: { value: PrepMissingGroupBy; label: string }[] = [
  { value: "doc", label: "書類別" },
  { value: "worker", label: "外国人別" },
  { value: "org", label: "所属機関別" },
  { value: "tantou", label: "担当者別" },
  { value: "issuer", label: "依頼先別" },
];

export const PREP_MISSING_NO_ORG_LABEL = "（所属機関が未登録）";
export const PREP_MISSING_NO_TANTOU_LABEL = "（担当者が未定）";
export const PREP_MISSING_NO_ISSUER_LABEL = "（まだ依頼していない・依頼先が未入力）";

export interface PrepMissingGroup {
  key: string; // 空文字 = 未登録・未入力
  label: string;
  rows: PrepMissingRow[];
}

// その行が、まとめ方ごとにどのグループに入るか
function groupKeyOf(row: PrepMissingRow, by: PrepMissingGroupBy): string {
  switch (by) {
    case "doc":
      return row.docId;
    case "worker":
      return row.workerId;
    case "org":
      return row.orgId;
    case "tantou":
      return row.tantou;
    case "issuer":
      return row.issuer;
  }
}

function groupLabelOf(row: PrepMissingRow, by: PrepMissingGroupBy): string {
  switch (by) {
    case "doc":
      return row.docBaseLabel;
    case "worker":
      return row.workerName;
    case "org":
      return row.orgName || PREP_MISSING_NO_ORG_LABEL;
    case "tantou":
      return row.tantou || PREP_MISSING_NO_TANTOU_LABEL;
    case "issuer":
      return row.issuer || PREP_MISSING_NO_ISSUER_LABEL;
  }
}

// 行の並び（外国人 → 書類の順）
function sortRows(a: PrepMissingRow, b: PrepMissingRow): number {
  return a.workerName === b.workerName
    ? a.docLabel.localeCompare(b.docLabel, "ja")
    : a.workerName.localeCompare(b.workerName, "ja");
}

// まとめる。件数の多いグループを先に、同数なら名前順。未登録・未入力のグループは最後
export function groupPrepMissing(
  rows: PrepMissingRow[],
  by: PrepMissingGroupBy,
): PrepMissingGroup[] {
  const map = new Map<string, PrepMissingGroup>();
  for (const r of rows) {
    const key = groupKeyOf(r, by);
    const g = map.get(key) ?? { key, label: groupLabelOf(r, by), rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, rows: [...g.rows].sort(sortRows) }))
    .sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;
      if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
      return a.label.localeCompare(b.label, "ja");
    });
}

// ---- しぼり込み（書類・外国人・所属機関・依頼先。組み合わせられる） ----

export interface PrepMissingFilter {
  docId: string; // 空 = すべて
  workerId: string;
  orgId: string; // PREP_MISSING_NONE = 所属機関が未登録の人
  tantou: string; // PREP_MISSING_NONE = 担当者が未定のもの
  issuer: string; // PREP_MISSING_NONE = まだ依頼していない・依頼先が未入力
}

export const EMPTY_PREP_MISSING_FILTER: PrepMissingFilter = {
  docId: "",
  workerId: "",
  orgId: "",
  tantou: "",
  issuer: "",
};

export type PrepMissingField = keyof PrepMissingFilter;

// しぼり込みの項目 → その行の値
function valueOf(row: PrepMissingRow, field: PrepMissingField): string {
  switch (field) {
    case "docId":
      return row.docId;
    case "workerId":
      return row.workerId;
    case "orgId":
      return row.orgId;
    case "tantou":
      return row.tantou;
    case "issuer":
      return row.issuer;
  }
}

// しぼり込みの項目 → 選択肢に出す名前
function labelOf(row: PrepMissingRow, field: PrepMissingField): string {
  switch (field) {
    case "docId":
      return row.docBaseLabel;
    case "workerId":
      return row.workerName;
    case "orgId":
      return row.orgName;
    case "tantou":
      return row.tantou;
    case "issuer":
      return row.issuer;
  }
}

// 1つの条件に当てはまるか（空 = すべて。PREP_MISSING_NONE = 未登録・未入力のものだけ）
function matchesOne(row: PrepMissingRow, field: PrepMissingField, value: string): boolean {
  if (!value) return true;
  const actual = valueOf(row, field);
  return value === PREP_MISSING_NONE ? !actual : actual === value;
}

// 指定した条件以外でしぼる（選択肢の件数を出すときに使う）
function filterExcept(
  rows: PrepMissingRow[],
  filter: PrepMissingFilter,
  except: PrepMissingField | null,
): PrepMissingRow[] {
  const fields: PrepMissingField[] = ["docId", "workerId", "orgId", "tantou", "issuer"];
  return rows.filter((r) =>
    fields.every((f) => f === except || matchesOne(r, f, filter[f])),
  );
}

export function filterPrepMissing(
  rows: PrepMissingRow[],
  filter: PrepMissingFilter,
): PrepMissingRow[] {
  return filterExcept(rows, filter, null);
}

export interface PrepMissingOption {
  value: string;
  label: string;
  count: number;
}

// 選択肢（いま選んでいるほかの条件でしぼったあとの件数を出す）。
// 書類は様式の並び、ほかは件数の多い順。未登録・未入力はいちばん最後
function optionsFor(
  rows: PrepMissingRow[],
  field: PrepMissingField,
  noneLabel: string,
): PrepMissingOption[] {
  const map = new Map<string, PrepMissingOption>();
  for (const r of rows) {
    const value = valueOf(r, field);
    const label = labelOf(r, field);
    const key = value || PREP_MISSING_NONE;
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { value: key, label: value ? label : noneLabel, count: 1 });
  }
  const docOrder = new Map(PREP_DOC_DEFS.map((d, i) => [d.id, i]));
  return [...map.values()].sort((a, b) => {
    if ((a.value === PREP_MISSING_NONE) !== (b.value === PREP_MISSING_NONE)) {
      return a.value === PREP_MISSING_NONE ? 1 : -1;
    }
    if (field === "docId") {
      return (docOrder.get(a.value) ?? 999) - (docOrder.get(b.value) ?? 999);
    }
    if (a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label, "ja");
  });
}

export interface PrepMissingOptions {
  docs: PrepMissingOption[];
  workers: PrepMissingOption[];
  orgs: PrepMissingOption[];
  tantous: PrepMissingOption[];
  issuers: PrepMissingOption[];
}

export function prepMissingOptions(
  rows: PrepMissingRow[],
  filter: PrepMissingFilter,
): PrepMissingOptions {
  return {
    docs: optionsFor(filterExcept(rows, filter, "docId"), "docId", "（書類が不明）"),
    workers: optionsFor(filterExcept(rows, filter, "workerId"), "workerId", "（氏名が未登録）"),
    orgs: optionsFor(filterExcept(rows, filter, "orgId"), "orgId", PREP_MISSING_NO_ORG_LABEL),
    tantous: optionsFor(
      filterExcept(rows, filter, "tantou"),
      "tantou",
      PREP_MISSING_NO_TANTOU_LABEL,
    ),
    issuers: optionsFor(
      filterExcept(rows, filter, "issuer"),
      "issuer",
      PREP_MISSING_NO_ISSUER_LABEL,
    ),
  };
}

// 見出しに出す件数
export interface PrepMissingSummary {
  rows: number; // まだ揃っていない書類の件数
  workers: number; // 対象の外国人の人数
  requesting: number; // 誰かに依頼して待っているもの
  notRequested: number; // まだ誰にも依頼していないもの
}

export function prepMissingSummary(rows: PrepMissingRow[]): PrepMissingSummary {
  return {
    rows: rows.length,
    workers: new Set(rows.map((r) => r.workerId)).size,
    requesting: rows.filter((r) => r.requesting).length,
    notRequested: rows.filter((r) => !r.requesting).length,
  };
}
