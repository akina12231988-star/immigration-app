import { describe, expect, it } from "vitest";
import {
  buildPostApplyEntries,
  mailingOf,
  newPostApplyMailing,
  normalizePostApplyMailings,
  normalizePostApplyTasks,
  openPostApplyCount,
  removeDocFromMailings,
  unmailedDocIds,
} from "./post-apply";

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

describe("入管へ郵送した記録", () => {
  it("まとめて1回で記録した書類は郵送済みになり、残りの件数から外れる", () => {
    const all = newPostApplyMailing(["kazei", "nozei"], "2026-09-25", "1234-5678-9012");
    expect(mailingOf("nozei", [all])?.tracking).toBe("1234-5678-9012");
    expect(unmailedDocIds(["kazei", "nozei", "gensen"], [all])).toEqual(["gensen"]);
    expect(openPostApplyCount({ docIds: ["kazei", "nozei"], mailings: [all], tasks: [] })).toBe(0);
  });
  it("分けて郵送したときは投函ごとの記録になり、取り消すと書類が残らない記録は消える", () => {
    const a = newPostApplyMailing(["kazei"], "2026-09-25", "111");
    const b = newPostApplyMailing(["nozei"], "2026-09-30", "222");
    expect(mailingOf("nozei", [a, b])?.posted_on).toBe("2026-09-30");
    expect(removeDocFromMailings("kazei", [a, b])).toEqual([b]);
  });
  it("保存値の正規化（書類の無い記録・壊れた値は除く）", () => {
    expect(normalizePostApplyMailings(null)).toEqual([]);
    expect(
      normalizePostApplyMailings([{ id: "x", doc_ids: ["kazei", 1], posted_on: "2026-09-25", tracking: "9" }, { doc_ids: [] }]),
    ).toEqual([{ id: "x", doc_ids: ["kazei"], posted_on: "2026-09-25", tracking: "9" }]);
  });
  it("一覧では全部郵送してタスクも済んだ準備リストは出さない", () => {
    const entries = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", post_apply_mailings: [{ id: "m", doc_ids: ["kazei"], posted_on: "2026-09-25", tracking: "" }] }],
      [{ checklist_id: "c1", doc_id: "kazei" }],
      new Map([["w1", "A"]]),
    );
    expect(entries).toEqual([]);
  });
});
