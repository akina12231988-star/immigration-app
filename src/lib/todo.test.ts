import { describe, expect, test } from "vitest";
import {
  displayTodoNo,
  isCheckingStatus,
  isImmigrationAppliedStatus,
  nextTodoNo,
  normalizeTodoKey,
  stageOfStatus,
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
