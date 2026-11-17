import { describe, expect, it } from "vitest";
import {
  SSW2_SAME_AS_SSW1,
  canonicalSubmissionKey,
  submissionLink,
  submissionListTitle,
  SUBMISSION_ITEMS,
  SUBMISSION_LINKS,
  canAttachToSubmissionRow,
  submissionAttachKey,
  submissionBundleOrder,
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

describe("「有」の書類を揃える", () => {
  it("リンク先は一覧にある書類だけ", () => {
    const keys = new Set(SUBMISSION_ITEMS.map((i) => i.key));
    for (const k of Object.keys(SUBMISSION_LINKS)) expect(keys.has(k)).toBe(true);
  });

  it("必要な書類の準備で揃える書類はこの行に添付しない（年金の15・二国間の20は添付もできる）", () => {
    expect(canAttachToSubmissionRow("t1-9")).toBe(false);
    expect(canAttachToSubmissionRow("t1-15")).toBe(true);
    expect(canAttachToSubmissionRow("t1-20")).toBe(true);
    expect(canAttachToSubmissionRow("t1-1")).toBe(true);
    expect(canAttachToSubmissionRow("t1-18")).toBe(true);
  });

  it("保存キーは prep_ で始まる英数字", () => {
    expect(submissionAttachKey("t3a-1-1")).toBe("prep_sl_t3a_1_1");
    expect(/^prep_[a-z0-9_]+$/.test(submissionAttachKey("t1-4-2"))).toBe(true);
  });

  it("まとめる順番は「有」の書類だけ・一覧表の順・同じ書類は1回", () => {
    const rows = buildSubmissionRows(
      { "t1-4-1": "有", "t1-15": "有", "t1-14": "有" },
      { ...base, hasNenkin: true },
      { agri: false },
    );
    const ids = submissionBundleOrder(rows).map((x) => x.id);
    expect(ids.indexOf("sl:t1-4-1")).toBeLessThan(ids.indexOf("kenshin"));
    expect(ids.indexOf("kenshin")).toBeLessThan(ids.indexOf("nozei_shiken"));
    expect(ids.filter((x) => x === "nenkin")).toHaveLength(1);
    expect(ids).toContain("sl:t1-15");
    expect(ids).not.toContain("hokensho"); // 国保なし → 12 は無
    expect(ids).not.toContain("sl:t1-1"); // 単独 → 1 は無
  });
});

describe("特定技能2号の一覧表", () => {
  it("第1表は1〜20、第3表の8の1（農業）は1〜3", () => {
    const nos = (t: string) => [...new Set(SUBMISSION_ITEMS.filter((i) => i.table === t).map((i) => Number(i.no)))];
    expect(nos("2-1")).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(nos("2-3agri")).toEqual([1, 2, 3]);
  });

  it("2号を選ぶと2号の表だけ。農業でなければ第3表は出さない", () => {
    const rows = buildSubmissionRows({}, base, { agri: true, ssw2: true });
    expect(new Set(rows.map((r) => r.table))).toEqual(new Set(["2-1", "2-3agri"]));
    expect(buildSubmissionRows({}, base, { agri: false, ssw2: true }).some((r) => r.table === "2-3agri")).toBe(false);
    expect(submissionListTitle(rows).kind).toBe("2号");
    expect(submissionListTitle(buildSubmissionRows({}, base, { agri: false })).kind).toBe("1号");
  });

  it("1号と同じ書類は同じ見当・同じ揃え方・同じひな形のキー", () => {
    for (const [k2, k1] of Object.entries(SSW2_SAME_AS_SSW1)) {
      expect(SUBMISSION_ITEMS.some((i) => i.key === k2)).toBe(true);
      expect(SUBMISSION_ITEMS.some((i) => i.key === k1)).toBe(true);
    }
    const ctx = { ...base, hasKokuho: true, hasNenkin: true };
    expect(suggestSubmissionMark("s2-14", ctx)).toBe(suggestSubmissionMark("t1-13", ctx));
    expect(submissionLink("s2-9-1")?.docs).toEqual(["kenshin"]);
    expect(canonicalSubmissionKey("s2-5")).toBe("t1-5");
    expect(canonicalSubmissionKey("s2-8")).toBe("s2-8");
  });

  it("2号だけの書類", () => {
    expect(suggestSubmissionMark("s2-8", base)).toBe("有"); // 1-32号 業務内容の誓約書
    expect(suggestSubmissionMark("s2-19", base)).toBeNull(); // 技能移転に係る申告書は選んでもらう
    expect(suggestSubmissionMark("s2-20", { ...base, nationality: "タイ" })).toBe("無"); // 2号はカンボジア・ベトナム
    expect(suggestSubmissionMark("s2-20", { ...base, nationality: "ベトナム" })).toBe("有");
    expect(submissionLink("s2a-1")?.docs).toEqual(["cert_ssw2"]);
  });

  it("印刷の題名が2号になる", () => {
    const html = submissionListPrintHtml({ workerName: "A", orgName: "B", rows: buildSubmissionRows({}, base, { agri: true, ssw2: true }) });
    expect(html).toContain("「特定技能２号」に係る提出書類一覧表");
    expect(html).toContain("第3表の8の1");
  });
});
