import { describe, expect, it } from "vitest";
import { EMPTY_PREP_META, type PrepChecklistMeta } from "@/lib/application-prep";
import {
  EMPTY_PREP_MISSING_FILTER,
  PREP_MISSING_NONE,
  PREP_MISSING_NO_ISSUER_LABEL,
  PREP_MISSING_NO_ORG_LABEL,
  PREP_MISSING_NO_TANTOU_LABEL,
  PREP_MISSING_NO_STATUS,
  filterPrepMissing,
  groupPrepMissing,
  prepMissingOptions,
  prepMissingRowsOf,
  prepMissingStatusText,
  prepMissingSummary,
  type PrepMissingRow,
} from "@/lib/prep-missing";

const meta: PrepChecklistMeta = { ...EMPTY_PREP_META, app_type: "変更", target_reiwa: 7 };

const baseInput = {
  workerId: "w1",
  workerName: "あさひ",
  orgId: "org1",
  orgName: "ABC株式会社",
  todoNo: "T-1",
  checklistId: "c1",
  meta,
  nationality: "カンボジア",
  sources: { filledDocKeys: new Set<string>(), photoPath: null, healthComplete: false },
  docStatuses: {},
  currentReiwa: 7,
};

describe("prepMissingRowsOf", () => {
  it("まだ完了していない必要書類だけを行にする（完了したものは出さない）", () => {
    const before = prepMissingRowsOf(baseInput);
    expect(before.some((r) => r.docId === "photo")).toBe(true);
    // 顔写真は登録しただけでは完了にならない（準備状況も完了の選択肢にする）
    const attached = prepMissingRowsOf({
      ...baseInput,
      sources: { ...baseInput.sources, photoPath: "photo/1.jpg" },
    });
    expect(attached.find((r) => r.docId === "photo")?.hasFile).toBe(true);
    const done = prepMissingRowsOf({
      ...baseInput,
      sources: { ...baseInput.sources, photoPath: "photo/1.jpg" },
      docStatuses: {
        photo: { status: "顔写真加工なし確認済み", note: "", dateOn: null, memo: "" },
      },
    });
    expect(done.some((r) => r.docId === "photo")).toBe(false);
  });

  it("推薦状はカンボジア国籍のときだけ出す", () => {
    expect(prepMissingRowsOf(baseInput).some((r) => r.docId === "suisenjo")).toBe(true);
    expect(
      prepMissingRowsOf({ ...baseInput, nationality: "ベトナム" }).some((r) => r.docId === "suisenjo"),
    ).toBe(false);
  });

  it("誰にいつ依頼したか・いまの状況・メモを行に入れる", () => {
    const rows = prepMissingRowsOf({
      ...baseInput,
      docStatuses: {
        suisenjo: {
          status: "発行依頼中",
          note: "送り出し機関",
          dateOn: "2026-09-01",
          memo: "9/20に催促",
        },
      },
    });
    const r = rows.find((x) => x.docId === "suisenjo")!;
    expect(r.issuer).toBe("送り出し機関");
    expect(r.requesting).toBe(true);
    expect(r.requestedOn).toBe("2026-09-01");
    expect(r.memo).toBe("9/20に催促");
    expect(r.workerName).toBe("あさひ");
    expect(r.orgName).toBe("ABC株式会社");
    expect(r.todoNo).toBe("T-1");
  });

  it("準備状況が未選択なら「未着手」と出す", () => {
    const r = prepMissingRowsOf(baseInput).find((x) => x.docId === "suisenjo")!;
    expect(r.status).toBe("");
    expect(r.requesting).toBe(false);
    expect(prepMissingStatusText(r)).toBe(PREP_MISSING_NO_STATUS);
  });

  it("年度つきの書類は令和年を付けた表示名にし、まとめ用の名前は年度なしにする", () => {
    const r = prepMissingRowsOf(baseInput).find((x) => x.docId === "kazei");
    if (r) {
      expect(r.docLabel).toContain("令和7");
      expect(r.docBaseLabel).not.toContain("令和");
    }
  });
});

// ---- まとめ方・しぼり込み ----

const row = (over: Partial<PrepMissingRow>): PrepMissingRow => ({
  workerId: "w1",
  workerName: "あさひ",
  orgId: "org1",
  orgName: "ABC株式会社",
  todoNo: "",
  checklistId: "c1",
  appType: "変更",
  appContent: "",
  tantou: "",
  docId: "suisenjo",
  docLabel: "推薦状",
  docBaseLabel: "推薦状",
  status: "",
  hasFile: false,
  issuer: "",
  requesting: false,
  requestedOn: null,
  memo: "",
  ...over,
});

const rows: PrepMissingRow[] = [
  row({ workerId: "w1", workerName: "あさひ", docId: "suisenjo", docBaseLabel: "推薦状", tantou: "野口" }),
  row({ workerId: "w2", workerName: "いろは", docId: "suisenjo", docBaseLabel: "推薦状", tantou: "秋吉" }),
  row({
    workerId: "w2",
    workerName: "いろは",
    docId: "kazei",
    docBaseLabel: "課税証明書",
    docLabel: "令和7年度 課税証明書",
    status: "発行依頼中",
    requesting: true,
    issuer: "本人",
    orgId: "org2",
    orgName: "DEF株式会社",
    tantou: "秋吉",
  }),
  row({
    workerId: "w3",
    workerName: "うえだ",
    docId: "kazei",
    docBaseLabel: "課税証明書",
    orgId: "",
    orgName: "",
    tantou: "",
  }),
];

describe("groupPrepMissing", () => {
  it("書類別にまとめる（件数の多い順）", () => {
    const g = groupPrepMissing(rows, "doc");
    // 同じ件数のときは名前順（か → す）
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([
      ["課税証明書", 2],
      ["推薦状", 2],
    ]);
  });

  it("外国人別にまとめる", () => {
    const g = groupPrepMissing(rows, "worker");
    expect(g[0].label).toBe("いろは");
    expect(g[0].rows.length).toBe(2);
  });

  it("所属機関別にまとめ、未登録は最後に置く", () => {
    const g = groupPrepMissing(rows, "org");
    expect(g.at(-1)?.label).toBe(PREP_MISSING_NO_ORG_LABEL);
    expect(g.at(-1)?.key).toBe("");
  });

  it("担当者別にまとめ、担当者が未定のものは最後に置く", () => {
    const g = groupPrepMissing(rows, "tantou");
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([
      ["秋吉", 2],
      ["野口", 1],
      [PREP_MISSING_NO_TANTOU_LABEL, 1],
    ]);
    expect(g.at(-1)?.key).toBe("");
  });

  it("依頼先別にまとめ、まだ依頼していないものは最後に置く", () => {
    const g = groupPrepMissing(rows, "issuer");
    expect(g[0].label).toBe("本人");
    expect(g.at(-1)?.label).toBe(PREP_MISSING_NO_ISSUER_LABEL);
  });
});

describe("filterPrepMissing", () => {
  it("書類と所属機関を組み合わせてしぼれる", () => {
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, docId: "kazei" }).length,
    ).toBe(2);
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, docId: "kazei", orgId: "org2" }).map(
        (r) => r.workerName,
      ),
    ).toEqual(["いろは"]);
  });

  it("担当者と書類を組み合わせてしぼれる", () => {
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, tantou: "秋吉" }).length,
    ).toBe(2);
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, tantou: "秋吉", docId: "suisenjo" }).map(
        (r) => r.workerName,
      ),
    ).toEqual(["いろは"]);
    // 担当者が未定のものだけ
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, tantou: PREP_MISSING_NONE }).map(
        (r) => r.workerName,
      ),
    ).toEqual(["うえだ"]);
  });

  it("所属機関が未登録の人・まだ依頼していないものだけを選べる", () => {
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, orgId: PREP_MISSING_NONE }).map(
        (r) => r.workerName,
      ),
    ).toEqual(["うえだ"]);
    expect(
      filterPrepMissing(rows, { ...EMPTY_PREP_MISSING_FILTER, issuer: PREP_MISSING_NONE }).length,
    ).toBe(3);
  });
});

describe("prepMissingOptions", () => {
  it("選んでいるほかの条件でしぼったあとの件数を出す", () => {
    const all = prepMissingOptions(rows, EMPTY_PREP_MISSING_FILTER);
    expect(all.docs.map((o) => [o.value, o.count])).toEqual([
      ["kazei", 2],
      ["suisenjo", 2],
    ]);
    // 所属機関で org2 にしぼると、書類の選択肢は課税証明書の1件だけになる
    const narrowed = prepMissingOptions(rows, { ...EMPTY_PREP_MISSING_FILTER, orgId: "org2" });
    expect(narrowed.docs.map((o) => [o.value, o.count])).toEqual([["kazei", 1]]);
    // 書類の選択肢は、その書類自身のしぼり込みでは減らない（選び直せるようにする）
    const byDoc = prepMissingOptions(rows, { ...EMPTY_PREP_MISSING_FILTER, docId: "kazei" });
    expect(byDoc.docs.length).toBe(2);
  });

  it("担当者の選択肢も、ほかの条件でしぼったあとの件数を出す", () => {
    const all = prepMissingOptions(rows, EMPTY_PREP_MISSING_FILTER);
    expect(all.tantous.map((o) => [o.label, o.count])).toEqual([
      ["秋吉", 2],
      ["野口", 1],
      [PREP_MISSING_NO_TANTOU_LABEL, 1],
    ]);
    const narrowed = prepMissingOptions(rows, { ...EMPTY_PREP_MISSING_FILTER, docId: "suisenjo" });
    expect(narrowed.tantous.map((o) => [o.label, o.count])).toEqual([
      ["秋吉", 1],
      ["野口", 1],
    ]);
  });

  it("所属機関が未登録の人はまとめて選べる", () => {
    const o = prepMissingOptions(rows, EMPTY_PREP_MISSING_FILTER);
    expect(o.orgs.at(-1)).toEqual({
      value: PREP_MISSING_NONE,
      label: PREP_MISSING_NO_ORG_LABEL,
      count: 1,
    });
  });
});

describe("prepMissingSummary", () => {
  it("件数・人数・依頼して待っている数を数える", () => {
    expect(prepMissingSummary(rows)).toEqual({
      rows: 4,
      workers: 3,
      requesting: 1,
      notRequested: 3,
    });
  });
});
