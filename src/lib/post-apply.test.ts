import { describe, expect, it } from "vitest";
import { buildPostApplyEntries, normalizePostApplyTasks, openPostApplyCount } from "./post-apply";

describe("normalizePostApplyTasks", () => {
  it("配列でない・文字の無いタスクは除く", () => {
    expect(normalizePostApplyTasks(null)).toEqual([]);
    expect(normalizePostApplyTasks("x")).toEqual([]);
    expect(
      normalizePostApplyTasks([{ id: "a", text: "理由書を送る", done: false }, { id: "b", text: " " }, 1, { text: "電話", done: true }]),
    ).toEqual([
      { id: "a", text: "理由書を送る", done: false },
      { id: "t2", text: "電話", done: true },
    ]);
  });
});

describe("buildPostApplyEntries", () => {
  const names = new Map([
    ["w1", "NGUYEN A"],
    ["w2", "TRAN B"],
    ["w3", "LE C"],
  ]);
  it("郵送する書類か済みでないタスクがある準備リストだけを、残りの多い順に並べる", () => {
    const entries = buildPostApplyEntries(
      [
        { id: "c1", worker_id: "w1", todo_no: "TODO-1", post_apply_tasks: [] },
        { id: "c2", worker_id: "w2", todo_no: "TODO-2", post_apply_tasks: [{ id: "t", text: "写真を送る", done: false }] },
        { id: "c3", worker_id: "w3", todo_no: "TODO-3", post_apply_tasks: [{ id: "t", text: "済み", done: true }] },
      ],
      [
        { checklist_id: "c2", doc_id: "kazei" },
        { checklist_id: "c2", doc_id: "gensen" },
        { checklist_id: "c1", doc_id: "kazei" },
      ],
      names,
    );
    expect(entries.map((e) => e.workerName)).toEqual(["TRAN B", "NGUYEN A"]);
    expect(entries[0].docIds).toEqual(["kazei", "gensen"]);
    expect(openPostApplyCount(entries[0])).toBe(3);
  });
});
