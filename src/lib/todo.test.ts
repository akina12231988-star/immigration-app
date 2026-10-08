import { describe, expect, test } from "vitest";
import {
  canAddExamAttempt,
  displayTodoNo,
  emptyExamAttempt,
  emptyTodoExam,
  examAccountMissing,
  examChoiceShort,
  examCurrentStep,
  examOpenSection,
  examProgress,
  examResultChecks,
  findExistingPrepTodo,
  isCheckingStatus,
  isImmigrationAppliedStatus,
  isWaitingDocsStatus,
  nextTodoNo,
  isSsw2ExamTitle,
  normalizeTodoExam,
  normalizeTodoKey,
  overdueExamAttempts,
  passedExamAttempt,
  ssw2ExamName,
  stageOfStatus,
  withExamSummary,
  type TodoStatusOption,
} from "@/lib/todo";

describe("nextTodoNo", () => {
  test("既存の番号（TODO-形式・数字のみ両方）の最大＋1を TODO-数字 の形で返す", () => {
    expect(nextTodoNo(["781", "782", "12", "", "TODO-9999", "  783 "])).toBe("TODO-10000");
    expect(nextTodoNo(["TODO-2000", "TODO-2001"])).toBe("TODO-2002");
  });

  test("番号がまだ無い・小さい番号しか無ければ TODO-2000 から始まる", () => {
    expect(nextTodoNo([])).toBe("TODO-2000");
    expect(nextTodoNo(["", "abc"])).toBe("TODO-2000");
    expect(nextTodoNo(["TODO-1305", "812"])).toBe("TODO-2000");
  });
});

describe("displayTodoNo", () => {
  test("数字だけの旧番号にも TODO- を付けてそろえる", () => {
    expect(displayTodoNo("812")).toBe("TODO-812");
    expect(displayTodoNo("TODO-2000")).toBe("TODO-2000");
    expect(displayTodoNo(" 812 ")).toBe("TODO-812");
    expect(displayTodoNo("")).toBe("");
  });
});

describe("stageOfStatus", () => {
  const options: TodoStatusOption[] = [
    { id: "1", kind: "申請準備", stage: "進行中", name: "書類待ち", sort_no: 1 },
    { id: "2", kind: "申請準備", stage: "完了", name: "入管へ申請！！", sort_no: 1 },
  ];

  test("選択肢に登録された区分を返す", () => {
    expect(stageOfStatus("書類待ち", options)).toBe("進行中");
    expect(stageOfStatus("入管へ申請！！", options)).toBe("完了");
  });

  test("選択肢に無い値は、未着手・完了・それ以外（進行中）で判定する", () => {
    expect(stageOfStatus("未着手", options)).toBe("未着手");
    expect(stageOfStatus("", options)).toBe("未着手");
    expect(stageOfStatus("完了", options)).toBe("完了");
    expect(stageOfStatus("独自のメモ", options)).toBe("進行中");
  });
});

describe("isCheckingStatus", () => {
  test("「〜チェック中」のときだけ確認ステータスを出す", () => {
    expect(isCheckingStatus("明菜　チェック中")).toBe(true);
    expect(isCheckingStatus("彩奈　チェック中")).toBe(true);
    expect(isCheckingStatus("書類待ち")).toBe(false);
  });
});

describe("isImmigrationAppliedStatus", () => {
  test("「入管へ申請！！」（表記の揺れを含む）のときだけ入管へ申請済みと判定する", () => {
    expect(isImmigrationAppliedStatus("入管へ申請！！")).toBe(true);
    expect(isImmigrationAppliedStatus("入管へ申請")).toBe(true);
    expect(isImmigrationAppliedStatus("書類作成中")).toBe(false);
    expect(isImmigrationAppliedStatus("未着手")).toBe(false);
    expect(isImmigrationAppliedStatus("")).toBe(false);
  });
});

describe("normalizeTodoKey", () => {
  test("書き方が揺れるTODO番号を同じキーにそろえる", () => {
    expect(normalizeTodoKey("TODO-1357")).toBe("1357");
    expect(normalizeTodoKey("#812")).toBe("812");
    expect(normalizeTodoKey(" 812 ")).toBe("812");
    expect(normalizeTodoKey("todo 42")).toBe("42");
    expect(normalizeTodoKey("")).toBe("");
  });
});

describe("findExistingPrepTodo", () => {
  const rows = [
    { worker_id: "w1", todo_no: "TODO-1234" },
    { worker_id: "w2", todo_no: "TODO-2001" },
    { worker_id: null, todo_no: "TODO-2002" },
  ];

  test("同じ外国人がすでに入っていればその行を返す（二重に作らない）", () => {
    expect(findExistingPrepTodo(rows, "w2", "")?.todo_no).toBe("TODO-2001");
  });

  test("同じTODO番号がすでに使われていればその行を返す（番号の重複で保存が失敗しない）", () => {
    expect(findExistingPrepTodo(rows, "w9", "todo1234")?.worker_id).toBe("w1");
    expect(findExistingPrepTodo(rows, "w9", "TODO-2002")?.todo_no).toBe("TODO-2002");
  });

  test("どちらも当てはまらなければ null（新しく作る）", () => {
    expect(findExistingPrepTodo(rows, "w9", "TODO-3000")).toBeNull();
    expect(findExistingPrepTodo(rows, "w9", "")).toBeNull();
  });

  test("usable を渡すと、その条件に合う行だけを「入っている」とみなす", () => {
    // 前の申請の終わったTODOは使い回さず、新しい番号をつける（更新準備の自動採番）
    const withStage = [
      { worker_id: "w1", todo_no: "TODO-1234", done: true },
      { worker_id: "w2", todo_no: "TODO-2001", done: false },
    ];
    const open = (r: (typeof withStage)[number]) => !r.done;
    expect(findExistingPrepTodo(withStage, "w1", "", open)).toBeNull();
    expect(findExistingPrepTodo(withStage, "w2", "", open)?.todo_no).toBe("TODO-2001");
    // 番号での突き合わせにも効く（終わった番号は使い回さない）
    expect(findExistingPrepTodo(withStage, "w9", "TODO-1234", open)).toBeNull();
  });
});

describe("isWaitingDocsStatus", () => {
  test("「必要な書類まち」「書類待ち」は書類待ち、それ以外は違う", () => {
    expect(isWaitingDocsStatus("必要な書類まち（AKINAチェック済み）")).toBe(true);
    expect(isWaitingDocsStatus("書類待ち")).toBe(true);
    expect(isWaitingDocsStatus("印鑑済み")).toBe(false);
    expect(isWaitingDocsStatus("")).toBe(false);
  });
});

describe("normalizeTodoExam（試験の申込）", () => {
  test("何も無いときは、空の1回目だけを持つ", () => {
    const e = normalizeTodoExam(null);
    expect(e.attempts).toHaveLength(1);
    expect(e.attempts[0]).toEqual(emptyExamAttempt());
  });

  test("回ごとの記録が無い古いデータは、そのときの申込日・試験日から1回目を組み立てる", () => {
    const e = normalizeTodoExam({
      applied_on: "2026-06-01",
      exam_date: "2026-07-10",
      result_checked: true,
      application_no: "2N33452c",
    });
    expect(e.application_no).toBe("2N33452c");
    expect(e.attempts).toHaveLength(1);
    expect(e.attempts[0].applied).toBe(true);
    expect(e.attempts[0].applied_on).toBe("2026-06-01");
    expect(e.attempts[0].exam_date).toBe("2026-07-10");
    // 古いデータは合否の別を持っていないので、確認済みとだけ残す
    expect(e.attempts[0].result).toBe("");
    expect(e.attempts[0].note).toContain("確認済み");
  });

  test("知らない合否の値は空（未確認）にする", () => {
    const e = normalizeTodoExam({ attempts: [{ result: "たぶん合格" }] });
    expect(e.attempts[0].result).toBe("");
  });
});

describe("withExamSummary", () => {
  test("互換のために残している欄を、最新の回に合わせる", () => {
    const e = normalizeTodoExam({
      attempts: [
        { applied_on: "2026-06-01", exam_date: "2026-07-10", result: "不合格" },
        { applied_on: "2026-08-01", exam_date: "2026-09-10", result: "" },
      ],
    });
    const out = withExamSummary(e);
    expect(out.applied_on).toBe("2026-06-01"); // 1回目の申込日
    expect(out.exam_date).toBe("2026-09-10"); // 最新の回の試験日
    expect(out.result_checked).toBe(false); // 最新の回はまだ未確認
  });
});

describe("overdueExamAttempts", () => {
  test("試験日を過ぎたのに合否が未確認の回だけを返す", () => {
    const e = normalizeTodoExam({
      attempts: [
        { exam_date: "2026-07-10", result: "不合格" }, // 確認済み
        { exam_date: "2026-08-10", result: "" }, // 過ぎていて未確認
        { exam_date: "2026-12-10", result: "" }, // まだ先
        { exam_date: "", result: "" }, // 試験日未登録
      ],
    });
    expect(overdueExamAttempts(e, "2026-09-30").map((a) => a.exam_date)).toEqual(["2026-08-10"]);
  });
});

describe("passedExamAttempt / canAddExamAttempt", () => {
  const exam = (results: string[]) =>
    normalizeTodoExam({ attempts: results.map((result) => ({ result })) });

  test("合格した回と、それが何回目かを返す", () => {
    expect(passedExamAttempt(exam(["不合格", "合格"]))?.no).toBe(2);
    expect(passedExamAttempt(exam(["不合格", ""]))).toBeNull();
  });

  test("次の申込を足せるのは、最後の回が不合格のときだけ", () => {
    expect(canAddExamAttempt(exam(["不合格"]))).toBe(true);
    expect(canAddExamAttempt(exam([""]))).toBe(false); // まだ結果が出ていない
    expect(canAddExamAttempt(exam(["不合格", "合格"]))).toBe(false); // 合格したのでもう要らない
  });
});

describe("特定技能2号の試験", () => {
  test("TODOの内容から2号の試験かどうかを見る", () => {
    expect(isSsw2ExamTitle("２号農業試験申込")).toBe(true);
    expect(isSsw2ExamTitle("２号アプリケーションナンバーの申込")).toBe(true);
    expect(isSsw2ExamTitle("１号農業試験申込")).toBe(false);
  });

  test("本人の情報に入れる試験名は、受験内容があればそれ、無ければTODOの内容から", () => {
    expect(ssw2ExamName("２号農業試験申込", "General crop farming Level 2（耕種農業全般）")).toBe(
      "General crop farming Level 2（耕種農業全般）",
    );
    expect(ssw2ExamName("２号農業試験申込", "")).toBe("２号農業試験");
  });
});

describe("examResultChecks（試験結果の確認）", () => {
  const todo = (over: Partial<Parameters<typeof examResultChecks>[0][number]>) => ({
    id: "t1",
    todo_no: "TODO-2092",
    kind: "試験の申込",
    worker_id: "w1",
    worker_name: "ソック チャンダラ",
    title: "２号農業試験申込",
    exam: null as unknown,
    deleted_at: null as string | null,
    ...over,
  });

  test("試験日を過ぎたのに合否が未確認の回だけを、回ごとに出す", () => {
    const rows = [
      todo({
        exam: {
          attempts: [
            { exam_date: "2026-07-10", result: "不合格" }, // 確認済み
            { exam_date: "2026-08-10", result: "" }, // これ
          ],
        },
      }),
      todo({ id: "t2", todo_no: "TODO-2093", exam: { attempts: [{ exam_date: "2026-12-01" }] } }), // まだ先
    ];
    const out = examResultChecks(rows, "2026-09-30");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ todoId: "t1", no: 2, examDate: "2026-08-10" });
  });

  test("試験の申込以外・削除フォルダのTODOは数えない", () => {
    const rows = [
      todo({ kind: "申請準備", exam: { attempts: [{ exam_date: "2026-01-01" }] } }),
      todo({ id: "t3", deleted_at: "2026-09-01", exam: { attempts: [{ exam_date: "2026-01-01" }] } }),
    ];
    expect(examResultChecks(rows, "2026-09-30")).toEqual([]);
  });

  test("確認が遅れているもの（試験日が古いもの）から並べる", () => {
    const rows = [
      todo({ id: "a", exam: { attempts: [{ exam_date: "2026-08-10" }] } }),
      todo({ id: "b", exam: { attempts: [{ exam_date: "2026-05-01" }] } }),
    ];
    expect(examResultChecks(rows, "2026-09-30").map((c) => c.todoId)).toEqual(["b", "a"]);
  });
});

describe("試験の申込の進み具合（examProgress）", () => {
  const T = "２号農業試験申込";
  const today = "2026-10-08";

  test("何も入れていなければ、受験内容が「いまここ」で、あとは未着手", () => {
    const steps = examProgress(emptyTodoExam(), T, today);
    expect(steps.map((s) => s.key)).toEqual(["choice", "account", "apply", "exam", "result"]);
    expect(steps.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(steps[1].detail).toBe("4項目が未入力");
    expect(steps[2].detail).toBe("1回目 未申込");
    expect(steps[3].detail).toBe("未定");
    expect(steps[4].detail).toBe("未確認");
    expect(examCurrentStep(steps)?.key).toBe("choice");
    expect(examOpenSection(steps)).toBe("account");
  });

  test("受験内容の段階は２号農業試験申込のときだけ", () => {
    const steps = examProgress(emptyTodoExam(), "１号農業試験申込", today);
    expect(steps.map((s) => s.key)).toEqual(["account", "apply", "exam", "result"]);
    expect(steps[0].state).toBe("current");
  });

  test("アカウントが全部入ると済みになり、申込が「いまここ」。試験日が先なら残り日数を出す", () => {
    const exam = {
      ...emptyTodoExam(),
      exam_choice: "General crop farming Level 2（耕種農業全般）",
      application_no: "A1",
      prometric_id: "P1",
      password: "x",
      login_email: "a@b.c",
      attempts: [{ ...emptyExamAttempt(), exam_date: "2026-10-25" }],
    };
    const steps = examProgress(exam, T, today);
    expect(steps[0]).toMatchObject({ state: "done", detail: "耕種農業全般" });
    expect(steps[1]).toMatchObject({ state: "done", detail: "入力済" });
    expect(steps[2].state).toBe("current");
    expect(steps[3]).toMatchObject({ state: "done", detail: "2026-10-25（あと17日）" });
    expect(examOpenSection(steps)).toBe("attempts");
  });

  test("申込済みでも代金を受け取っていなければ申込・代金は済みにしない", () => {
    const exam = {
      ...emptyTodoExam(),
      attempts: [{ ...emptyExamAttempt(), applied_on: "2026-10-01", fee: "8,000円" }],
    };
    const steps = examProgress(exam, "１号農業試験申込", today);
    const apply = steps.find((s) => s.key === "apply")!;
    expect(apply.state).toBe("todo"); // アカウントが先に「いまここ」
    expect(apply.detail).toBe("1回目 2026-10-01・代金未受取");
  });

  test("試験日を過ぎて合否が未確認なら合否を赤にする", () => {
    const exam = {
      ...emptyTodoExam(),
      attempts: [{ ...emptyExamAttempt(), applied_on: "2026-09-01", exam_date: "2026-09-20" }],
    };
    const steps = examProgress(exam, "１号農業試験申込", today);
    expect(steps.at(-1)).toMatchObject({ state: "alert", detail: "試験日を過ぎています・未確認" });
    expect(examCurrentStep(steps)?.key).toBe("account"); // 最初の未済（アカウント）
  });

  test("合格すれば全部済み。不合格なら次の回を促す", () => {
    const full = {
      ...emptyTodoExam(),
      application_no: "A",
      prometric_id: "P",
      password: "x",
      login_email: "a@b.c",
    };
    const passed = examProgress(
      { ...full, attempts: [{ ...emptyExamAttempt(), applied_on: "2026-09-01", exam_date: "2026-09-20", result: "合格" }] },
      "１号農業試験申込",
      today,
    );
    expect(passed.every((s) => s.state === "done")).toBe(true);
    expect(passed.at(-1)?.detail).toBe("1回目で合格");
    expect(examCurrentStep(passed)).toBeNull();
    const failed = examProgress(
      { ...full, attempts: [{ ...emptyExamAttempt(), applied_on: "2026-09-01", exam_date: "2026-09-20", result: "不合格" }] },
      "１号農業試験申込",
      today,
    );
    expect(failed.at(-1)?.detail).toBe("不合格（次の回を足す）");
  });

  test("examAccountMissing / examChoiceShort", () => {
    expect(examAccountMissing(emptyTodoExam())).toEqual([
      "アプリケーションNo.",
      "プロメトリックID",
      "パスワード",
      "ログイン先のメールアドレス",
    ]);
    expect(examAccountMissing({ ...emptyTodoExam(), application_no: "A", password: " " })).toEqual([
      "プロメトリックID",
      "パスワード",
      "ログイン先のメールアドレス",
    ]);
    expect(examChoiceShort("General livestock farming Level 2（畜産農業全般）")).toBe("畜産農業全般");
    expect(examChoiceShort("そのまま")).toBe("そのまま");
  });
});
