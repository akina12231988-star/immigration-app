import { describe, expect, it } from "vitest";
import {
  SUBMISSION_ITEMS,
  buildSubmissionRows,
  normalizeSubmissionMarks,
  submissionListPrintHtml,
  suggestSubmissionMark,
  type SubmissionContext,
} from "./submission-list";

const base: SubmissionContext = {
  jointKind: "単独",
  hasKokuho: false,
  hasNenkin: false,
  flexYear: null,
  assen: "",
  nationality: "インドネシア",
  certPattern: "",
};

describe("提出書類一覧表の項目", () => {
  it("第1表は1〜20の順、第3表（農業・直接雇用）は1〜4の順", () => {
    const nos = (t: string) => [...new Set(SUBMISSION_ITEMS.filter((i) => i.table === t).map((i) => Number(i.no)))];
    expect(nos("1")).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(nos("3agri")).toEqual([1, 2, 3, 4]);
  });

  it("キーが重ならない", () => {
    const keys = SUBMISSION_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("有／無の見当", () => {
  it("提出が必須（○）の書類は有", () => {
    for (const key of ["t1-2", "t1-3", "t1-5", "t1-6-1", "t1-6-2", "t1-8-1", "t1-8-2", "t1-18", "t3a-2", "t3a-3"]) {
      expect(suggestSubmissionMark(key, base)).toBe("有");
    }
  });

  it("国保・年金に入っているかで 12〜15", () => {
    expect(suggestSubmissionMark("t1-12", base)).toBe("無");
    expect(suggestSubmissionMark("t1-13", { ...base, hasKokuho: true })).toBe("有");
    expect(suggestSubmissionMark("t1-14", { ...base, hasNenkin: true })).toBe("有");
    expect(suggestSubmissionMark("t1-15", base)).toBe("無");
  });

  it("連名なら申請人名簿、変形労働時間制なら 6(3)(4)、あっせん有りなら 7(2)", () => {
    expect(suggestSubmissionMark("t1-1", { ...base, jointKind: "連名" })).toBe("有");
    expect(suggestSubmissionMark("t1-1", base)).toBe("無");
    expect(suggestSubmissionMark("t1-6-3", base)).toBeNull();
    expect(suggestSubmissionMark("t1-6-4", { ...base, flexYear: true })).toBe("有");
    expect(suggestSubmissionMark("t1-6-3", { ...base, flexYear: false })).toBe("無");
    expect(suggestSubmissionMark("t1-7-2", { ...base, assen: "あり" })).toBe("有");
    expect(suggestSubmissionMark("t1-7-2", { ...base, assen: "なし" })).toBe("無");
  });

  it("二国間取決め（20）はカンボジア・タイ・ベトナム", () => {
    expect(suggestSubmissionMark("t1-20", { ...base, nationality: "カンボジア" })).toBe("有");
    expect(suggestSubmissionMark("t1-20", { ...base, nationality: "ベトナム" })).toBe("有");
    expect(suggestSubmissionMark("t1-20", base)).toBe("無");
  });

  it("同一年度内の受入れで決まる 4・7(1) は選んでもらう", () => {
    expect(suggestSubmissionMark("t1-4-1", base)).toBeNull();
    expect(suggestSubmissionMark("t1-4-2", base)).toBeNull();
    expect(suggestSubmissionMark("t1-7-1", base)).toBeNull();
  });

  it("農業の1（技能・日本語）は合格証の組み合わせから", () => {
    const m = (p: string) => ["t3a-1-1", "t3a-1-2", "t3a-1-3"].map((k) => suggestSubmissionMark(k, { ...base, certPattern: p }));
    expect(m("専門級")).toEqual(["有", "無", "無"]);
    expect(m("専門外・日本語")).toEqual(["無", "有", "有"]);
    expect(m("")).toEqual([null, null, null]);
  });
});

describe("画面・印刷に出す行", () => {
  it("保存した選択を見当より優先し、農業でなければ第3表を出さない", () => {
    const rows = buildSubmissionRows({ "t1-12": "有" }, base, { agri: false });
    expect(rows.some((r) => r.table === "3agri")).toBe(false);
    const r12 = rows.find((r) => r.key === "t1-12");
    expect(r12).toMatchObject({ mark: "有", auto: false });
    expect(rows.find((r) => r.key === "t1-13")).toMatchObject({ mark: "無", auto: true });
    expect(buildSubmissionRows({}, base, { agri: true }).some((r) => r.table === "3agri")).toBe(true);
  });

  it("保存値の読み込みは有／無だけ", () => {
    expect(normalizeSubmissionMarks({ a: "有", b: "無", c: "x", d: 1 })).toEqual({ a: "有", b: "無" });
    expect(normalizeSubmissionMarks(null)).toEqual({});
    expect(normalizeSubmissionMarks([])).toEqual({});
  });

  it("印刷では選んだほうに○が付き、氏名・機関名が入る", () => {
    const rows = buildSubmissionRows({ "t1-1": "有" }, base, { agri: true });
    const html = submissionListPrintHtml({ workerName: "TEST <A>", orgName: "農園", rows });
    expect(html).toContain("TEST &lt;A&gt;");
    expect(html).toContain("農園");
    expect(html).toContain('<span class="mk on">有</span><span class="mk">無</span>');
    expect(html).toContain("第3表の13の1");
  });
});
