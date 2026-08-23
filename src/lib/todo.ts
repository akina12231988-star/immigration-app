// TODO機能（NotionのTODOデータベースの置き換え）。
// TODOは3つの構成で、番号は通しで自動採番する。
// ステータス（経過）の選択肢は todo_status_options に保存し、画面から随時変更できる。

export const TODO_KINDS = ["申請準備", "退職の随時報告書", "試験の申込"] as const;
export type TodoKind = (typeof TODO_KINDS)[number];

export const TODO_STAGES = ["未着手", "進行中", "完了"] as const;
export type TodoStage = (typeof TODO_STAGES)[number];

// 選択肢の種類。3つの構成に加えて、経過が「〜チェック中」のときに出す
// 確認ステータス用の「チェック」がある
export const TODO_CHECK_KIND = "チェック" as const;
export type TodoOptionKind = TodoKind | typeof TODO_CHECK_KIND;

export interface TodoStatusOption {
  id: string;
  kind: TodoOptionKind;
  stage: TodoStage;
  name: string;
  sort_no: number;
}

// 経過が「チェック中」（明菜　チェック中／彩奈　チェック中 など）か。
// このとき確認ステータス（kind='チェック'）の欄を出す
export function isCheckingStatus(status: string): boolean {
  return status.includes("チェック中");
}

// 申請準備のTODOが「入管へ申請！！」（入管へ申請済み）のステータスか。
// 申請一覧の「申請前＜準備中＞」には、この状態になった人だけを表示する
// （準備中の人は申請準備のTODOで管理する）。選択肢名は画面から変更できるため、
// 「！！」の有無などの揺れを許容して部分一致で判定する
export function isImmigrationAppliedStatus(status: string): boolean {
  return status.includes("入管へ申請");
}

// TODO番号の突き合わせ用の正規化（「TODO-1357」「#812」「 812 」→「1357」「812」「812」）。
// 郵送請求の判定記録など、書き方が揺れる番号どうしをリンクさせるのに使う
export function normalizeTodoKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .replace(/^todo/, "");
}

// 新規の自動採番はこの番号（TODO-2000）から始める。
// Notion由来の既存番号（TODO-1305 など）と混ざらないよう、まとまった大きい番号にしている
export const TODO_NO_START = 2000;

// 次のTODO番号。既存の番号（「TODO-1234」「812」どちらの書き方も数える）の最大＋1を
// 「TODO-数字」の形で返す。まだ小さい番号しか無ければ TODO-2000 から始める
export function nextTodoNo(existing: string[]): string {
  let max = 0;
  for (const no of existing) {
    const key = normalizeTodoKey(no ?? "");
    if (/^\d+$/.test(key)) max = Math.max(max, Number(key));
  }
  return `TODO-${Math.max(max + 1, TODO_NO_START)}`;
}

// 表示・コピー用のTODO番号（数字だけの旧番号にも TODO- を付けてそろえる）
export function displayTodoNo(no: string): string {
  const s = (no ?? "").trim();
  return /^\d+$/.test(s) ? `TODO-${s}` : s;
}

// ステータス名 → 区分（未着手/進行中/完了）。選択肢に無い自由入力は「進行中」とみなす
export function stageOfStatus(
  status: string,
  options: TodoStatusOption[],
): TodoStage {
  const opt = options.find((o) => o.name === status);
  if (opt) return opt.stage;
  if (status === "未着手" || status === "") return "未着手";
  if (status === "完了") return "完了";
  return "進行中";
}
