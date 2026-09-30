// TODO機能（NotionのTODOデータベースの置き換え）。
// TODOは4つの構成で、番号は通しで自動採番する。
// ステータス（経過）の選択肢は todo_status_options に保存し、画面から随時変更できる。

export const TODO_KINDS = [
  "申請準備",
  "退職の随時報告書",
  "試験の申込",
  "特定技能総合保険",
] as const;
export type TodoKind = (typeof TODO_KINDS)[number];

export const TODO_STAGES = ["未着手", "進行中", "完了"] as const;
export type TodoStage = (typeof TODO_STAGES)[number];

// 選択肢の種類。4つの構成に加えて、経過が「〜チェック中」のときに出す
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

// ---- 試験の申込のTODO ----

// 試験の申込のTODOの内容（自由入力ではなくこの3つから選ぶ）
export const EXAM_TODO_TITLES = [
  "２号農業試験申込",
  "２号アプリケーションナンバーの申込",
  "１号農業試験申込",
] as const;

// ２号農業試験申込のとき、どちらの試験を希望するか
export const EXAM_CONTENT_CHOICES = [
  "General crop farming Level 2（耕種農業全般）",
  "General livestock farming Level 2（畜産農業全般）",
] as const;

// 試験の合否
export const EXAM_RESULTS = ["", "合格", "不合格"] as const;
export type ExamResult = (typeof EXAM_RESULTS)[number];

// 1回ぶんの試験の申込。
// 不合格ならまた申し込むので、申込日・試験日・代金・合否は回ごとに残す
export interface TodoExamAttempt {
  applied: boolean; // 申込済みか
  applied_on: string; // 申込日
  exam_date: string; // 試験日（この日を過ぎて合否が未確認ならアラートを出す）
  fee: string; // 代金
  fee_received: boolean; // 代金を本人から受け取ったか
  fee_received_on: string; // 受け取りを確認した日
  result: ExamResult; // 合否（空は未確認）
  result_on: string; // 合否を確認した日
  note: string; // メモ（会場・不合格の理由など）
}

export function emptyExamAttempt(): TodoExamAttempt {
  return {
    applied: false,
    applied_on: "",
    exam_date: "",
    fee: "",
    fee_received: false,
    fee_received_on: "",
    result: "",
    result_on: "",
    note: "",
  };
}

export function normalizeExamAttempt(raw: unknown): TodoExamAttempt {
  const base = emptyExamAttempt();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  return {
    applied: Boolean(r.applied ?? base.applied),
    applied_on: str(r.applied_on, base.applied_on),
    exam_date: str(r.exam_date, base.exam_date),
    fee: str(r.fee, base.fee),
    fee_received: Boolean(r.fee_received ?? base.fee_received),
    fee_received_on: str(r.fee_received_on, base.fee_received_on),
    result: EXAM_RESULTS.includes(r.result as ExamResult) ? (r.result as ExamResult) : base.result,
    result_on: str(r.result_on, base.result_on),
    note: str(r.note, base.note),
  };
}

// 試験の申込のTODOの詳細（todos.exam jsonb・0109）。
// アカウントの情報（アプリケーションNo.・プロメトリックIDなど）は何回申し込んでも同じなので
// 1つだけ持ち、申込日・試験日・代金・合否は attempts に回ごとに持つ
export interface TodoExam {
  exam_choice: string; // 希望する受験内容（２号農業試験申込のとき）
  applied_on: string; // 1回目の申込日（古いデータとの互換のため残す。最新の回に合わせる）
  exam_date: string; // 最新の回の試験日（同上）
  result_checked: boolean; // 最新の回の合否を確認したか（同上）
  application_no: string; // アプリケーションNo.
  prometric_id: string; // プロメトリックID
  password: string; // パスワード
  login_email: string; // ログイン先のメールアドレス
  login_email_owner: string; // メールアドレスを作ったのは（'' / 本人が作成 / 弊社が作成）
  login_email_password: string; // メールアドレスのパスワード（弊社が作成した場合に記録）
  attempts: TodoExamAttempt[]; // 何回目の申込か（1件以上。不合格なら次の回を足す）
}

export function emptyTodoExam(): TodoExam {
  return {
    exam_choice: "",
    applied_on: "",
    exam_date: "",
    result_checked: false,
    application_no: "",
    prometric_id: "",
    password: "",
    login_email: "",
    login_email_owner: "",
    login_email_password: "",
    attempts: [emptyExamAttempt()],
  };
}

// 保存された jsonb（項目が欠けていることがある）を、欠けを既定値で埋めた形にする。
// attempts がまだ無い古いデータは、そのときの申込日・試験日・結果確認から1回目を組み立てる
export function normalizeTodoExam(raw: unknown): TodoExam {
  const base = emptyTodoExam();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const applied_on = str(r.applied_on, base.applied_on);
  const exam_date = str(r.exam_date, base.exam_date);
  const result_checked = Boolean(r.result_checked ?? base.result_checked);
  const attempts = Array.isArray(r.attempts)
    ? r.attempts.map(normalizeExamAttempt)
    : [
        {
          ...emptyExamAttempt(),
          applied: applied_on !== "",
          applied_on,
          exam_date,
          // 古いデータは合格・不合格の別を持っていないので、確認済みとだけ残す
          note: result_checked ? "試験結果を確認済み（合否は未記録）" : "",
        },
      ];
  return {
    exam_choice: str(r.exam_choice, base.exam_choice),
    applied_on,
    exam_date,
    result_checked,
    application_no: str(r.application_no, base.application_no),
    prometric_id: str(r.prometric_id, base.prometric_id),
    password: str(r.password, base.password),
    login_email: str(r.login_email, base.login_email),
    login_email_owner: str(r.login_email_owner, base.login_email_owner),
    login_email_password: str(r.login_email_password, base.login_email_password),
    attempts: attempts.length > 0 ? attempts : [emptyExamAttempt()],
  };
}

// 保存する形にそろえる。古い画面・古いデータと混ざっても困らないよう、
// 互換のために残している applied_on / exam_date / result_checked を最新の回に合わせる
export function withExamSummary(exam: TodoExam): TodoExam {
  const last = exam.attempts.at(-1) ?? emptyExamAttempt();
  return {
    ...exam,
    applied_on: exam.attempts[0]?.applied_on ?? "",
    exam_date: last.exam_date,
    result_checked: last.result !== "",
  };
}

// 試験日を過ぎたのに合否が未確認の回（アラートに出す）
export function overdueExamAttempts(exam: TodoExam, today: string): TodoExamAttempt[] {
  return exam.attempts.filter((a) => a.exam_date !== "" && a.exam_date < today && a.result === "");
}

// 合格した回（あれば。何回目かも返す）
export function passedExamAttempt(exam: TodoExam): { no: number; attempt: TodoExamAttempt } | null {
  const i = exam.attempts.findIndex((a) => a.result === "合格");
  return i < 0 ? null : { no: i + 1, attempt: exam.attempts[i] };
}

// 次の回を足せるか。合格していればもう要らず、最後の回が不合格のときだけ足せる
export function canAddExamAttempt(exam: TodoExam): boolean {
  if (passedExamAttempt(exam)) return false;
  return (exam.attempts.at(-1)?.result ?? "") === "不合格";
}

// 特定技能2号の試験か（合格したら本人の情報に「2号合格」として残す）
export function isSsw2ExamTitle(title: string): boolean {
  return title.includes("２号") || title.includes("2号");
}

// 合格したときに本人の情報（workers.ssw2_exam）へ入れる試験名。
// 希望する受験内容を選んでいればそれ、無ければTODOの内容から
export function ssw2ExamName(todoTitle: string, examChoice: string): string {
  return examChoice.trim() || todoTitle.replace(/申込$/, "").trim();
}

// ---- 試験結果の確認（試験日を過ぎたのに合否が未確認） ----

// メニューのアラート・ホームの一覧に出す1件
export interface ExamResultCheck {
  todoId: string;
  todoNo: string;
  workerId: string | null;
  workerName: string;
  title: string; // TODOの内容（２号農業試験申込 など）
  no: number; // 何回目の申込か
  examDate: string;
}

// 試験の申込のTODOのうち、試験日を過ぎたのに合否が未確認のもの。
// 削除フォルダに入れたTODOは数えない
export function examResultChecks(
  todos: {
    id: string;
    todo_no: string;
    kind: string;
    worker_id: string | null;
    worker_name?: string | null;
    title: string;
    exam: unknown;
    deleted_at?: string | null;
  }[],
  today: string,
): ExamResultCheck[] {
  const out: ExamResultCheck[] = [];
  for (const t of todos) {
    if (t.kind !== "試験の申込" || t.deleted_at) continue;
    const exam = normalizeTodoExam(t.exam);
    exam.attempts.forEach((a, i) => {
      if (a.exam_date === "" || a.exam_date >= today || a.result !== "") return;
      out.push({
        todoId: t.id,
        todoNo: t.todo_no,
        workerId: t.worker_id,
        workerName: t.worker_name ?? "",
        title: t.title,
        no: i + 1,
        examDate: a.exam_date,
      });
    });
  }
  // 試験日が古い（確認が遅れている）ものから
  return out.sort((a, b) => a.examDate.localeCompare(b.examDate));
}

// 経過が「チェック中」（明菜　チェック中／彩奈　チェック中 など）か。
// このとき確認ステータス（kind='チェック'）の欄を出す
export function isCheckingStatus(status: string): boolean {
  return status.includes("チェック中");
}

// 申請準備のTODOが「必要な書類まち」（書類待ち）のステータスか。
// このときは何の書類を待っているかを記入でき、TODO一覧・申請準備・A4印刷のメモに出す。
// 選択肢名は画面から変更できるため「まち／待ち」の揺れを許容して部分一致で判定する
export function isWaitingDocsStatus(status: string): boolean {
  return status.includes("書類まち") || status.includes("書類待ち");
}

// 申請準備のTODOが「入管へ申請！！」（入管へ申請済み）のステータスか。
// 申請一覧の「申請前＜入管提出！！＞」には、この状態になった人だけを表示する
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

// すでに申請準備のTODOに入っているか（同じ外国人、または同じTODO番号なら「入っている」）。
// 申請準備の画面から追加したのに一覧に出てこない、二重に入る、のどちらも起きないようにする。
//
// usable を渡すと、その条件に合う行だけを「入っている」とみなす。
// 更新準備から番号を自動でつけるときは、前の申請の終わったTODOを使い回さないよう、
// 完了していないTODOだけを対象にする
export function findExistingPrepTodo<T extends { worker_id: string | null; todo_no: string }>(
  rows: T[],
  workerId: string,
  todoNo: string,
  usable?: (row: T) => boolean,
): T | null {
  const list = usable ? rows.filter(usable) : rows;
  const byWorker = list.find((r) => r.worker_id === workerId);
  if (byWorker) return byWorker;
  const key = normalizeTodoKey(todoNo);
  if (!key) return null;
  return list.find((r) => normalizeTodoKey(r.todo_no) === key) ?? null;
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
