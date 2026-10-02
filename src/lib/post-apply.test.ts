import { describe, expect, it } from "vitest";
import {
  addPostApplyNote,
  buildPostApplyEntries,
  postApplyMailingRecords,
  isPostApplyDocDone,
  postApplyNoteAuthor,
  unissuedDocIds,
  normalizePostApplyNotes,
  postApplyDocKey,
  postApplyTaskKey,
  removePostApplyNote,
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

describe("申請後に発行はするが郵送しない書類（0174）", () => {
  const names = new Map([["w1", "NGUYEN A"]]);

  it("郵送する書類とは別の一覧になり、まだ発行できていないものは残りの件数に入る", () => {
    const entries = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", todo_no: "TODO-1", post_apply_tasks: [] }],
      [{ checklist_id: "c1", doc_id: "kazei" }],
      names,
      [
        { checklist_id: "c1", doc_id: "nenkin", done: false },
        { checklist_id: "c1", doc_id: "hokensho", done: true },
      ],
    );
    expect(entries[0].docIds).toEqual(["kazei"]);
    expect(entries[0].issueOnlyDocs).toEqual([
      { docId: "nenkin", done: false },
      { docId: "hokensho", done: true },
    ]);
    // 郵送1件＋未発行1件（発行済みは数えない）
    expect(openPostApplyCount(entries[0])).toBe(2);
    expect(unissuedDocIds(entries[0].issueOnlyDocs)).toEqual(["nenkin"]);
  });

  it("発行だけの書類しかなくても、まだ発行できていなければ一覧に出す", () => {
    const entries = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", todo_no: "TODO-1", post_apply_tasks: [] }],
      [],
      names,
      [{ checklist_id: "c1", doc_id: "nenkin", done: false }],
    );
    expect(entries.map((e) => e.workerName)).toEqual(["NGUYEN A"]);
  });

  it("全部発行できたら、一覧から消える", () => {
    const entries = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", todo_no: "TODO-1", post_apply_tasks: [] }],
      [],
      names,
      [{ checklist_id: "c1", doc_id: "nenkin", done: true }],
    );
    expect(entries).toEqual([]);
  });

  it("年金記録は準備状況が「発行済み」なら発行できたと見る", () => {
    expect(isPostApplyDocDone("nenkin", "発行済み")).toBe(true);
    expect(isPostApplyDocDone("nenkin", "秋吉伽恋に発行依頼中")).toBe(false);
    expect(isPostApplyDocDone("nenkin", "")).toBe(false);
  });
});

describe("メモの記入者", () => {
  it("メールアドレスは出さない（表示名が未設定のときに保存された分）", () => {
    expect(postApplyNoteAuthor("akina.1223.1988@gmail.com")).toBe("");
    expect(postApplyNoteAuthor("  someone@example.co.jp ")).toBe("");
  });

  it("名前はそのまま出す", () => {
    expect(postApplyNoteAuthor("野口")).toBe("野口");
    expect(postApplyNoteAuthor(" 秋吉伽恋 ")).toBe("秋吉伽恋");
    expect(postApplyNoteAuthor("")).toBe("");
    expect(postApplyNoteAuthor(null)).toBe("");
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
  it("全部郵送してタスクも済んだ準備リストも、記録を見返せるよう残す（残りは0件）", () => {
    const entries = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", post_apply_mailings: [{ id: "m", doc_ids: ["kazei"], posted_on: "2026-09-25", tracking: "" }] }],
      [{ checklist_id: "c1", doc_id: "kazei" }],
      new Map([["w1", "A"]]),
    );
    expect(entries).toHaveLength(1);
    expect(openPostApplyCount(entries[0])).toBe(0);
    // 郵送する書類もタスクも記録も無い準備リストは出さない
    expect(buildPostApplyEntries([{ id: "c2", worker_id: "w1" }], [], new Map([["w1", "A"]]))).toEqual([]);
  });
  it("投函の記録を全員ぶんまとめて、投函日の新しい順→氏名順に並べる", () => {
    const records = postApplyMailingRecords([
      {
        checklistId: "c1",
        workerId: "w1",
        workerName: "TRAN B",
        todoNo: "25-1",
        mailings: [newPostApplyMailing(["kazei"], "2026-09-25", "111"), newPostApplyMailing(["nozei"], "2026-09-30", "222")],
      },
      { checklistId: "c2", workerId: "w2", workerName: "NGUYEN A", todoNo: "25-2", mailings: [newPostApplyMailing(["gensen"], "2026-09-30", "333")] },
    ]);
    expect(records.map((r) => [r.workerName, r.mailing.posted_on, r.mailing.tracking])).toEqual([
      ["NGUYEN A", "2026-09-30", "333"],
      ["TRAN B", "2026-09-30", "222"],
      ["TRAN B", "2026-09-25", "111"],
    ]);
  });
});

describe("申請後の郵送・タスクの項目ごとのメモ", () => {
  it("書類とタスクで別のキーになる", () => {
    expect(postApplyDocKey("kazei")).toBe("doc:kazei");
    expect(postApplyTaskKey("t1")).toBe("task:t1");
  });

  it("メモを足すと下に積まれ、日付と記入者が残る", () => {
    let notes = addPostApplyNote({}, "doc:kazei", " 現在発行手続き中との連絡あり ", "2026-09-27", "野口");
    notes = addPostApplyNote(notes, "doc:kazei", "10/3に発行予定", "2026-09-28", "");
    expect(notes["doc:kazei"].map((n) => [n.text, n.on, n.by])).toEqual([
      ["現在発行手続き中との連絡あり", "2026-09-27", "野口"],
      ["10/3に発行予定", "2026-09-28", ""],
    ]);
  });

  it("消して空になった項目はキーごと消える", () => {
    const notes = addPostApplyNote({}, "task:t1", "連絡待ち", "2026-09-27", "");
    const id = notes["task:t1"][0].id;
    expect(removePostApplyNote(notes, "task:t1", id)).toEqual({});
  });

  it("保存値を正規化する（未適用・壊れた値・空のメモは捨てる）", () => {
    expect(normalizePostApplyNotes(null)).toEqual({});
    expect(normalizePostApplyNotes([])).toEqual({});
    expect(
      normalizePostApplyNotes({
        "doc:kazei": [{ id: "n1", text: "連絡あり", on: "2026-09-27", by: "野口" }, { text: "  " }, 3],
        "task:t1": "壊れた値",
      }),
    ).toEqual({ "doc:kazei": [{ id: "n1", text: "連絡あり", on: "2026-09-27", by: "野口" }] });
  });

  it("一覧の1人ぶんにメモが入る", () => {
    const [e] = buildPostApplyEntries(
      [{ id: "c1", worker_id: "w1", post_apply_notes: { "doc:kazei": [{ id: "n1", text: "連絡あり", on: "", by: "" }] } }],
      [{ checklist_id: "c1", doc_id: "kazei" }],
      new Map([["w1", "NGUYEN VAN AN"]]),
    );
    expect(e.notes["doc:kazei"][0].text).toBe("連絡あり");
  });
});
