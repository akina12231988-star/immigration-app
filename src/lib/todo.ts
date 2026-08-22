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

// TODO番号の突き合わせ用の正規化（「TODO-1357」「#812」「 812 」→「1357」「812」「812」）。
// 郵送請求の判定記録など、書き方が揺れる番号どうしをリンクさせるのに使う
export function normalizeTodoKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .replace(/^todo/, "");
}

// 次のTODO番号。既存の番号（TODO・申請準備・随時報告の記録に入っているNotion由来の
// 番号を含む）のうち数字のものの最大＋1を返す。数字以外の番号は採番には使わない
export function nextTodoNo(existing: string[]): string {
  let max = 0;
  for (const no of existing) {
    const s = (no ?? "").trim();
    if (/^\d+$/.test(s)) max = Math.max(max, Number(s));
  }
  return String(max + 1);
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
