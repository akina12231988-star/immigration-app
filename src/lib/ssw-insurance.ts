// 特定技能総合保険の管理（TODO ＞ 特定技能総合保険）。
//
// 誰が未加入か、誰の期限が切れているかを仕分けして、
// 加入手続き・解約手続きのTODO（todos.kind = '特定技能総合保険'）につなげる。
// 所属機関の負担区分が「外国人負担」のときは、本人が加入を希望した場合だけ加入するため、
// 意思確認をして「加入しない」と決めたらその記録（ssw_insurance_declined）を残す。

import { daysUntil } from "@/lib/worker-alerts";
import { stageOfStatus, type TodoStage, type TodoStatusOption } from "@/lib/todo";

// TODOの構成名（0139 で todos.kind に追加）
export const SSW_INSURANCE_TODO_KIND = "特定技能総合保険";

// 作るTODOの内容（この2種類だけ。行の突き合わせにも使う）
export const SSW_JOIN_TODO_TITLE = "特定技能総合保険の加入手続き";
export const SSW_CANCEL_TODO_TITLE = "特定技能総合保険の解約手続き";

// 特定技能総合保険のTODOの経過（0139 の初期選択肢と同じ3つ）
export const SSW_INSURANCE_STATUSES = ["未着手", "申込手続中", "完了"] as const;

// 期限アラートを出し始める日数（有効期限の1か月前＝ダッシュボードのアラートと同じ）
export const SSW_SOON_DAYS = 31;

// 画面で扱う外国人の項目（一覧は列を絞って取る）
export interface SswInsuranceWorker {
  id: string;
  name: string;
  kana: string;
  nationality: string;
  gender: string; // 男 / 女（申込フォームの性別）
  birth: string | null; // 生年月日（申込フォームで使う）
  status: string; // 申請準備中 / 在籍中 / 退職 など
  support: string; // 支援開始前 / 支援対象 / 支援対象外
  residence_status: string;
  residence_expiry_date: string | null; // 在留期限（加入月数の計算に使う）
  leaving_on: string | null;
  current_organization_id: string | null;
  organizations?: { name: string } | null; // 一覧では機関マスタから引くので任意
  messenger_link: string;
  ssw_insurance_link: string;
  ssw_insurance_expiry_date: string | null;
  ssw_insurance_self_join: boolean;
  ssw_insurance_no: string;
  ssw_insurance_declined: boolean;
  ssw_insurance_declined_on: string | null;
  // どの所属機関にいたときに「加入しない」と決めたか（転職したら決め直す・0140）
  ssw_insurance_declined_org_id: string | null;
  ssw_insurance_note: string; // 加入しない理由などの備考
}

// 特定技能総合保険の対象になる在留資格か（特定技能の人だけが加入する保険）
export function isSswInsuranceTarget(residenceStatus: string): boolean {
  return (residenceStatus ?? "").includes("特定技能");
}

// 保険に入る候補の人か。
// 「申請準備中」で「支援開始前」の人は、まだ入社（許可）前で保険に入らないので候補にしない
export function isSswInsuranceCandidate(
  w: Pick<SswInsuranceWorker, "status" | "support">,
): boolean {
  return !(w.status === "申請準備中" && w.support === "支援開始前");
}

// 加入しているか（有効期限が入っていれば加入している）
export function isSswJoined(w: Pick<SswInsuranceWorker, "ssw_insurance_expiry_date">): boolean {
  return !!w.ssw_insurance_expiry_date;
}

// 行の仕分け。
//   cancel     … 退職したので解約手続きが必要
//   expired    … 有効期限が切れている（加入手続きのTODOを作る）
//   soon       … 有効期限まで1か月以内
//   notJoined  … 未加入（会社負担、または外国人負担で本人が加入を希望）
//   willCheck  … 未加入・外国人負担で、本人の意思確認がまだ
//   declined   … 意思確認をして「加入しない」と決めた
//   active     … 加入中（期限に余裕がある）
//   none       … 一覧に出さない（退職していて加入もしていない など）
export type SswGroupKey =
  | "cancel"
  | "expired"
  | "soon"
  | "notJoined"
  | "willCheck"
  | "declined"
  | "active"
  | "none";

// 「加入しない」の判断が今も効いているか。
// 判断したときの所属機関から別の機関に移った（転職した）ときは、
// その機関で改めて検討するため効かなくなる（また一覧に出る）
export function isSswDeclineActive(w: SswInsuranceWorker): boolean {
  if (!w.ssw_insurance_declined) return false;
  // 判断したときの機関が分からない古い記録は、そのまま「加入しない」を続ける
  if (!w.ssw_insurance_declined_org_id) return true;
  return w.ssw_insurance_declined_org_id === w.current_organization_id;
}

export function sswInsuranceState(
  w: SswInsuranceWorker,
  burden: string, // 所属機関の負担区分（'' / 会社負担 / 外国人負担）
  today: string,
  cancelDone = false, // 解約手続きのTODOが完了しているか
): SswGroupKey {
  // まだ入社前（申請準備中・支援開始前）の人は一覧に出さない
  if (!isSswInsuranceCandidate(w)) return "none";
  const joined = isSswJoined(w);
  // 退職した人は、加入したままなら解約手続きが必要（解約が済んだら一覧から外す）
  if (w.status === "退職") return joined && !cancelDone ? "cancel" : "none";
  // まだ期限に余裕があるうちは、加入しないと決めていても加入中のまま
  if (joined && daysUntil(w.ssw_insurance_expiry_date as string, today) >= SSW_SOON_DAYS) {
    return "active";
  }
  // 加入しないと決めた人は、その所属機関にいる間はTODO（未加入・期限切れ）に出さない
  if (isSswDeclineActive(w)) return "declined";
  if (joined) {
    return daysUntil(w.ssw_insurance_expiry_date as string, today) < 0 ? "expired" : "soon";
  }
  // 外国人負担のときは、本人が希望したときだけ加入する（希望が無ければ意思確認から）
  if (burden === "外国人負担" && !w.ssw_insurance_self_join) return "willCheck";
  return "notJoined";
}

// TODO（加入手続き・解約手続き）の要約。1人につき最新の1件ずつを見る
export interface SswTodoRef {
  id: string;
  todo_no: string;
  title: string;
  status: string;
  stage: TodoStage; // 未着手 / 進行中 / 完了
  done: boolean;
}

export interface SswTodoPair {
  join?: SswTodoRef;
  cancel?: SswTodoRef;
}

// 外国人ID → 加入・解約のTODO。同じ内容が複数あるときは先頭（新しい順で渡す前提）を使う
export function sswTodosByWorker(
  todos: {
    id: string;
    todo_no: string;
    kind: string;
    worker_id: string | null;
    title: string;
    status: string;
    deleted_at?: string | null;
  }[],
  options: TodoStatusOption[],
): Map<string, SswTodoPair> {
  const opts = options.filter((o) => o.kind === SSW_INSURANCE_TODO_KIND);
  const map = new Map<string, SswTodoPair>();
  for (const t of todos) {
    if (t.kind !== SSW_INSURANCE_TODO_KIND || !t.worker_id || t.deleted_at) continue;
    const stage = stageOfStatus(t.status, opts);
    const ref: SswTodoRef = {
      id: t.id,
      todo_no: t.todo_no,
      title: t.title,
      status: t.status,
      stage,
      done: stage === "完了",
    };
    const pair = map.get(t.worker_id) ?? {};
    // 解約手続き以外（既定は加入手続き）は加入のTODOとして扱う
    if (t.title === SSW_CANCEL_TODO_TITLE) {
      if (!pair.cancel) pair.cancel = ref;
    } else if (!pair.join) {
      pair.join = ref;
    }
    map.set(t.worker_id, pair);
  }
  return map;
}

export interface SswInsuranceRow {
  worker: SswInsuranceWorker;
  orgName: string;
  burden: string;
  state: SswGroupKey;
  todos: SswTodoPair;
}

// 表示順: 有効期限の早い順（未加入は期限なしなので氏名順で後ろ）
function compareRows(a: SswInsuranceRow, b: SswInsuranceRow): number {
  const ea = a.worker.ssw_insurance_expiry_date ?? "";
  const eb = b.worker.ssw_insurance_expiry_date ?? "";
  if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  return a.worker.name.localeCompare(b.worker.name, "ja");
}

// 一覧を作る。orgBurden は所属機関ID → 負担区分（'' / 会社負担 / 外国人負担）
export function buildSswInsuranceRows(
  workers: SswInsuranceWorker[],
  orgBurden: Map<string, { name: string; burden: string }>,
  todosByWorker: Map<string, SswTodoPair>,
  today: string,
): SswInsuranceRow[] {
  return workers
    .map((w) => {
      const org = w.current_organization_id ? orgBurden.get(w.current_organization_id) : undefined;
      const todos = todosByWorker.get(w.id) ?? {};
      return {
        worker: w,
        orgName: org?.name ?? w.organizations?.name ?? "",
        burden: org?.burden ?? "",
        state: sswInsuranceState(w, org?.burden ?? "", today, todos.cancel?.done ?? false),
        todos,
      };
    })
    .filter((r) => r.state !== "none")
    .sort(compareRows);
}

// 欄（セクション）の並びと見出し
export const SSW_SECTIONS: {
  key: Exclude<SswGroupKey, "none">;
  title: string;
  lead: string;
  collapsed?: boolean; // 既定で閉じておく欄（対応が要らない人たち）
}[] = [
  {
    key: "expired",
    title: "期限切れ",
    lead: "有効期限が過ぎています。加入手続きのTODOを作って手続きしてください。",
  },
  {
    key: "cancel",
    title: "退職（解約手続き）",
    lead: "退職した人で保険に加入したままです。解約手続きのTODOを作って手続きしてください。",
  },
  {
    key: "soon",
    title: "まもなく期限（1か月以内）",
    lead: "有効期限まで1か月を切りました。更新（加入手続き）の準備をしてください。",
  },
  {
    key: "notJoined",
    title: "未加入",
    lead: "まだ加入していません。加入手続きのTODOを作って手続きしてください。",
  },
  {
    key: "willCheck",
    title: "未加入（外国人負担・意思確認）",
    lead:
      "所属機関が外国人負担のため、本人が加入を希望した場合だけ加入します。意思確認をして「加入する」「加入しない」を押してください。",
  },
  {
    key: "declined",
    title: "加入しない（意思確認済み）",
    lead:
      "加入しないと決めた人です。この所属機関にいる間は未加入・期限切れのTODOに出ません（別の所属機関に転職したら、また一覧に出ます）。希望が変わったら「加入する」に戻せます。",
    collapsed: true,
  },
  {
    key: "active",
    title: "加入中",
    lead: "有効期限まで1か月以上あります。",
    collapsed: true,
  },
];

// ---- 未着手／申込手続中の2列表示 ----

// 対応が必要な区分（この人たちを左右の列に分けて出す）。
// 加入中・加入しないは対応が要らないので列には出さない
export const SSW_ACTION_STATES: SswGroupKey[] = [
  "expired",
  "cancel",
  "soon",
  "notJoined",
  "willCheck",
];

export function isSswActionRow(row: SswInsuranceRow): boolean {
  return SSW_ACTION_STATES.includes(row.state);
}

// 列（左: まだ手続きを始めていない人 ／ 右: 申込手続き中の人）
export type SswColumnKey = "notStarted" | "inProgress";

export const SSW_COLUMNS: { key: SswColumnKey; title: string; lead: string }[] = [
  {
    key: "notStarted",
    title: "未着手",
    lead: "まだTODOを作っていない人、経過が未着手の人です。",
  },
  {
    key: "inProgress",
    title: "申込手続中",
    lead: "加入・解約の手続きを進めている人です（経過が未着手以外）。",
  },
];

// その行のTODO（退職の人は解約手続き、それ以外は加入手続き）
export function sswRowTodo(row: SswInsuranceRow): SswTodoRef | undefined {
  return row.state === "cancel" ? row.todos.cancel : row.todos.join;
}

// どちらの列に出すか。TODOが無い・経過が未着手なら左、それ以外は右
export function sswColumnOf(row: SswInsuranceRow): SswColumnKey {
  const todo = sswRowTodo(row);
  if (!todo || todo.stage === "未着手") return "notStarted";
  return "inProgress";
}

// 手続きの種類。加入手続きと解約手続きは別の欄に分けて出す
export type SswTaskKey = "join" | "cancel";

export const SSW_TASK_GROUPS: { key: SswTaskKey; title: string; lead: string }[] = [
  {
    key: "join",
    title: "加入手続き",
    lead: "未加入・期限切れ・まもなく期限の人です。加入（更新）の手続きをします。",
  },
  {
    key: "cancel",
    title: "解約手続き",
    lead: "退職して保険に加入したままの人です。解約の手続きをします。",
  },
];

export function sswTaskOf(row: SswInsuranceRow): SswTaskKey {
  return row.state === "cancel" ? "cancel" : "join";
}

// ---- 並び替え ----

export type SswSortKey = "expiry" | "expiryDesc" | "name" | "org";

export const SSW_SORTS: { key: SswSortKey; label: string }[] = [
  { key: "expiry", label: "有効期限が古い順（期限切れが先）" },
  { key: "expiryDesc", label: "有効期限が新しい順" },
  { key: "name", label: "氏名順" },
  { key: "org", label: "所属機関名順" },
];

function byName(a: SswInsuranceRow, b: SswInsuranceRow): number {
  return a.worker.name.localeCompare(b.worker.name, "ja");
}

// 並び替えた新しい配列を返す（元の配列は変えない）
export function sortSswRows(rows: SswInsuranceRow[], sort: SswSortKey): SswInsuranceRow[] {
  const list = [...rows];
  if (sort === "name") return list.sort(byName);
  if (sort === "org") {
    return list.sort((a, b) => a.orgName.localeCompare(b.orgName, "ja") || byName(a, b));
  }
  // 有効期限で並べる。未加入（期限なし）はどちらの並びでも最後にまとめる
  return list.sort((a, b) => {
    const ea = a.worker.ssw_insurance_expiry_date ?? "";
    const eb = b.worker.ssw_insurance_expiry_date ?? "";
    if (!ea && !eb) return byName(a, b);
    if (!ea) return 1;
    if (!eb) return -1;
    if (ea === eb) return byName(a, b);
    return sort === "expiryDesc" ? (ea > eb ? -1 : 1) : ea < eb ? -1 : 1;
  });
}

// 行に付ける区分の短いラベル（2列にすると欄の見出しが無くなるため）
export const SSW_STATE_LABELS: Record<SswGroupKey, string> = {
  expired: "期限切れ",
  cancel: "退職",
  soon: "まもなく期限",
  notJoined: "未加入",
  willCheck: "未加入（意思確認）",
  declined: "加入しない",
  active: "加入中",
  none: "",
};

// 一覧に出す件数（未加入・期限切れなど、対応が必要な行の合計）
export function sswActionCount(rows: SswInsuranceRow[]): number {
  return rows.filter(
    (r) => r.state === "expired" || r.state === "soon" || r.state === "notJoined" || r.state === "cancel",
  ).length;
}

// ---- 加入しない理由（備考） ----

// 「加入しない」ときに選ぶ理由。その他を選んだときは自由入力にする
export const SSW_DECLINE_REASONS = ["特定技能２号になったから", "その他"] as const;
export type SswDeclineReason = (typeof SSW_DECLINE_REASONS)[number];

// 所属機関が外国人負担のときの理由。本人が希望しなければ加入しないので、
// 「加入しない」を押した時点でこの理由を自動で備考に残す（理由を選ばせない）
export const SSW_BURDEN_DECLINE_REASON = "外国人負担だから";

// 押しただけで決まる理由（外国人負担）。それ以外は理由を選んでもらうので null
export function sswAutoDeclineReason(burden: string): string | null {
  return burden === "外国人負担" ? SSW_BURDEN_DECLINE_REASON : null;
}

// 備考に残す文言。その他のときは入力した内容をそのまま残す
export function sswDeclineNote(reason: string, other: string): string {
  return reason === "その他" ? other.trim() : reason;
}

// ---- 加入の申込フォームに入れる内容 ----

// 保険の申込サイトで選べる加入月数の上限（1〜36ヶ月）
export const SSW_MAX_MONTHS = 36;

// YYYY-MM-DD に月を足す（月末は日を丸める。例: 1/31 + 1ヶ月 = 2/28）
export function addMonthsDate(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// 保険始期希望日（着金日以降）から在留期限までをカバーするのに必要な加入月数。
// 「始期＋n ヶ月」が在留期限以上になる最小の n（1〜36）を返す。
// 在留期限が未登録のとき、または始期が在留期限を過ぎているときは null
export function sswInsuranceMonths(startOn: string, residenceExpiry: string | null): number | null {
  if (!startOn || !residenceExpiry) return null;
  if (startOn >= residenceExpiry) return null;
  for (let m = 1; m <= SSW_MAX_MONTHS; m += 1) {
    if (addMonthsDate(startOn, m) >= residenceExpiry) return m;
  }
  return null;
}

// 申込フォームの日付の書き方（西暦 YYYY/MM/DD）
export function slashDate(dateStr: string | null): string {
  return dateStr ? dateStr.replaceAll("-", "/") : "";
}

// 明日の日付（保険始期希望日の初期値。着金日以降にするため今日ではなく翌日）
export function tomorrowOf(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// 申込フォームに入れる項目（画面ではこの並びでコピーできるようにする）
export interface SswApplyField {
  label: string;
  value: string;
  hint?: string; // 未登録のときの案内
}

export function sswApplyFields(
  w: SswInsuranceWorker,
  orgName: string,
  startOn: string,
): SswApplyField[] {
  return [
    {
      label: "特定技能外国人(特定技能1号) 氏名（アルファベット）",
      value: w.name,
      hint: w.name ? undefined : "外国人詳細の氏名が未登録です",
    },
    {
      label: "国籍",
      value: w.nationality,
      hint: w.nationality ? undefined : "外国人詳細の国籍が未登録です",
    },
    {
      label: "性別",
      value: w.gender,
      hint: w.gender ? undefined : "外国人詳細の性別が未登録です",
    },
    {
      label: "生年月日",
      value: slashDate(w.birth),
      hint: w.birth ? undefined : "外国人詳細の生年月日が未登録です",
    },
    {
      label: "着金日以降の保険始期希望日",
      value: slashDate(startOn),
    },
    {
      label: "特定技能所属機関名",
      value: orgName,
      hint: orgName ? undefined : "現在の所属機関が未設定です",
    },
  ];
}

// まとめてコピーする文字列（項目名なしで、フォームの並びのまま1行ずつ）
export function sswApplyCopyText(fields: SswApplyField[]): string {
  return fields.map((f) => f.value).join("\n");
}
