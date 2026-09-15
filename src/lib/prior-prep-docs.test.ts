import { describe, expect, it } from "vitest";
import { PREP_DOC_DEFS } from "./application-prep";
import { previousChecklist, priorDocAttached, priorDocYear, priorDocYearNote } from "./prior-prep-docs";

const def = (id: string) => {
  const d = PREP_DOC_DEFS.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};

const lists = [
  { id: "c", todo_no: "TODO-3", target_reiwa: 8, planned_app_on: "2026-09-20", updated_at: "2026-09-10T00:00:00Z" },
  { id: "b", todo_no: "TODO-2", target_reiwa: 7, planned_app_on: "2026-03-05", updated_at: "2026-03-01T00:00:00Z" },
  { id: "a", todo_no: "TODO-1", target_reiwa: 6, planned_app_on: null, updated_at: "2025-03-01T00:00:00Z" },
];

describe("previousChecklist", () => {
  it("表示中のリストを除き、前回の申請日にいちばん近いリストを選ぶ", () => {
    expect(previousChecklist(lists, "TODO-3", "2026-03-10")?.id).toBe("b");
    expect(previousChecklist(lists, "TODO-3", "2025-03-15")?.id).toBe("a");
  });
  it("申請日が分からなければ最近のリスト。ほかに無ければ null", () => {
    expect(previousChecklist(lists, "TODO-3", null)?.id).toBe("b");
    expect(previousChecklist(lists.slice(0, 1), "TODO-3", null)).toBeNull();
  });
  it("申請日より後のリストしか無ければ、いちばん古いものを返す", () => {
    expect(previousChecklist(lists, "TODO-3", "2024-01-01")?.id).toBe("a");
  });
});

describe("priorDocYear / priorDocAttached / priorDocYearNote", () => {
  const prev = lists[1]; // 令和7年度・2026-03-05 申請予定（令和8年）
  const docs = [
    { doc_key: "prep_kazei_r7", storage_path: "x" },
    { doc_key: "prep_nozei_shiken_r7_p2", storage_path: "x" },
    { doc_key: "gensen_r6", storage_path: "x" },
  ];
  it("課税・市県民税は対象年度、源泉徴収票は前年分、国保税は当時の最新年度", () => {
    expect(priorDocYear(def("kazei"), prev)).toBe(7);
    expect(priorDocYear(def("nozei_shiken"), prev)).toBe(7);
    expect(priorDocYear(def("gensen"), prev)).toBe(6);
    expect(priorDocYear(def("nozei_kokuho"), prev)).toBe(8);
    expect(priorDocYear(def("hokensho"), prev)).toBeNull();
  });
  it("年度付きの書類は添付の有無を判定できる（枝番も含む）", () => {
    expect(priorDocAttached(def("kazei"), 7, docs)).toBe(true);
    expect(priorDocAttached(def("nozei_shiken"), 7, docs)).toBe(true);
    expect(priorDocAttached(def("gensen"), 6, docs)).toBe(true);
    expect(priorDocAttached(def("kazei"), 6, docs)).toBe(false);
    expect(priorDocAttached(def("nozei_kokuho"), 8, docs)).toBeNull();
  });
  it("今回と同じ年度なら再提出を省ける案内、違えば今回の年度を添える", () => {
    expect(priorDocYearNote(def("kazei"), prev, 7, docs)).toBe(
      "令和7年度を添付済み → 今回も令和7年度なので再提出を省けます",
    );
    expect(priorDocYearNote(def("kazei"), prev, 8, docs)).toBe(
      "令和7年度を添付済み（今回は令和8年度が必要）",
    );
    expect(priorDocYearNote(def("gensen"), prev, 7, docs)).toBe(
      "令和6年分を添付済み（今回は令和7年分が必要）",
    );
    expect(priorDocYearNote(def("kazei"), { ...prev, target_reiwa: 6 }, 7, docs)).toBe(
      "令和6年度（添付なし）（今回は令和7年度が必要）",
    );
    expect(priorDocYearNote(def("hokensho"), prev, null, docs)).toBe("");
  });
});
