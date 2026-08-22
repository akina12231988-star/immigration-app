import { describe, expect, test } from "vitest";
import {
  isCheckingStatus,
  nextTodoNo,
  normalizeTodoKey,
  stageOfStatus,
  type TodoStatusOption,
} from "@/lib/todo";

describe("nextTodoNo", () => {
  test("既存の数字の番号の最大＋1を返す（数字以外・空は無視）", () => {
    expect(nextTodoNo(["781", "782", "12", "", "TODO-9999", "  783 "])).toBe("784");
  });

  test("番号がまだ無ければ1から始まる", () => {
    expect(nextTodoNo([])).toBe("1");
    expect(nextTodoNo(["", "abc"])).toBe("1");
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

describe("normalizeTodoKey", () => {
  test("書き方が揺れるTODO番号を同じキーにそろえる", () => {
    expect(normalizeTodoKey("TODO-1357")).toBe("1357");
    expect(normalizeTodoKey("#812")).toBe("812");
    expect(normalizeTodoKey(" 812 ")).toBe("812");
    expect(normalizeTodoKey("todo 42")).toBe("42");
    expect(normalizeTodoKey("")).toBe("");
  });
});
