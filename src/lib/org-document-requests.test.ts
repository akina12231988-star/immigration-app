import { describe, expect, it } from "vitest";
import {
  checkState,
  daysToDue,
  dueLabel,
  emptyCheck,
  indexChecks,
  itemAppliesTo,
  itemsToText,
  joinedYearExcludedReason,
  joinedYearFromNote,
  normalizeItems,
  parseItemsText,
  requestProgress,
  toggleStep,
  workerPending,
  nationalityOptions,
  joinedYearOptions,
  filterRequestWorkers,
  normalizeDocName,
  docNameReiwaYear,
  matchesOnboardingDoc,
  findOnboardingDocFor,
  type DocumentRequestCheck,
} from "./org-document-requests";

let n = 0;
const ids = () => `i${++n}`;

describe("書類の依頼の項目", () => {
  it("1行1項目。「項目名｜補足」「項目名（補足）」を読み、先頭の記号・番号は外す", () => {
    n = 0;
    expect(
      parseItemsText(
        "・扶養控除申告書\n・扶養証明書(日本語訳)｜コピーでいいです\n\n3. 送金証明書\n令和8年度源泉徴収票（2026年入社の方）",
        ids,
      ),
    ).toEqual([
      { id: "i1", name: "扶養控除申告書", note: "", joined_year: null },
      { id: "i2", name: "扶養証明書(日本語訳)", note: "コピーでいいです", joined_year: null },
      { id: "i3", name: "送金証明書", note: "", joined_year: null },
      { id: "i4", name: "令和8年度源泉徴収票", note: "2026年入社の方", joined_year: 2026 },
    ]);
  });

  it("補足の「○○年入社」から入社年を読み、その年に入社した人だけが対象になる", () => {
    expect(joinedYearFromNote("２０２６年に入社した方のみ")).toBe(2026);
    expect(joinedYearFromNote("2026年度入社")).toBe(2026);
    expect(joinedYearFromNote("コピーでよい")).toBeNull();
    const item = { joined_year: 2026 };
    expect(itemAppliesTo(item, "2026-03-01")).toBe(true);
    expect(itemAppliesTo(item, "2025-09-03")).toBe(false);
    expect(itemAppliesTo(item, null)).toBe(true); // 入社日が分からない人は対象にしておく
    expect(itemAppliesTo({ joined_year: null }, "2020-01-01")).toBe(true);
    expect(joinedYearExcludedReason(item, "2025-09-03")).toBe("2025年入社のため対象外");
  });

  it("項目をテキストに戻せる", () => {
    expect(itemsToText([{ id: "a", name: "送金証明書", note: "", joined_year: null }, { id: "b", name: "源泉徴収票", note: "2026年入社の方", joined_year: 2026 }])).toBe(
      "送金証明書\n源泉徴収票｜2026年入社の方",
    );
  });

  it("DB の jsonb が壊れていても落ちない", () => {
    expect(normalizeItems(null)).toEqual([]);
    expect(normalizeItems([{ name: " 送金証明書 " }, { id: "x", name: "", note: "" }, "bad", { id: "y", name: "源泉", note: "2026年入社の方" }])).toEqual([
      { id: "item0", name: "送金証明書", note: "", joined_year: null },
      { id: "y", name: "源泉", note: "2026年入社の方", joined_year: 2026 },
    ]);
  });
});

describe("チェックの段階", () => {
  const base = emptyCheck("r", "w", "a");

  it("案内 → 発行 → 送付の順に進み、前の段階は同じ日で埋まる", () => {
    const issued = toggleStep(base, "issued_on", "2026-10-19");
    expect(issued).toMatchObject({ informed_on: "2026-10-19", issued_on: "2026-10-19", sent_on: null });
    expect(checkState(issued)).toBe("発行済");
    const sent = toggleStep({ ...issued, informed_on: "2026-10-15" }, "sent_on", "2026-10-20");
    expect(sent).toMatchObject({ informed_on: "2026-10-15", issued_on: "2026-10-19", sent_on: "2026-10-20" });
    expect(checkState(sent)).toBe("送付済");
  });

  it("外すときは後の段階も外れる。対象外にしていたら解除される", () => {
    const all = { ...base, informed_on: "2026-10-15", issued_on: "2026-10-16", sent_on: "2026-10-17", not_needed: true };
    const back = toggleStep(all, "issued_on", "2026-10-19");
    expect(back).toMatchObject({ informed_on: "2026-10-15", issued_on: null, sent_on: null, not_needed: false });
    expect(checkState(back)).toBe("案内済");
    expect(checkState({ ...all })).toBe("対象外");
    expect(checkState(undefined)).toBe("未着手");
  });
});

describe("進み具合", () => {
  const items = [
    { id: "a", name: "扶養控除申告書", note: "", joined_year: null },
    { id: "b", name: "源泉徴収票", note: "2026年入社の方", joined_year: 2026 },
  ];
  const w1 = { id: "w1", startOn: "2026-03-01" };
  const w2 = { id: "w2", startOn: "2025-09-03" };
  const check = (worker_id: string, item_id: string, over: Partial<DocumentRequestCheck>): DocumentRequestCheck => ({
    id: `${worker_id}${item_id}`,
    request_id: "r",
    worker_id,
    item_id,
    informed_on: null,
    issued_on: null,
    sent_on: null,
    not_needed: false,
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  });
  const checks = [
    check("w1", "a", { informed_on: "2026-10-15", issued_on: "2026-10-16", sent_on: "2026-10-17" }),
    check("w2", "a", { informed_on: "2026-10-15" }),
    check("w1", "b", { not_needed: true }),
  ];

  it("項目ごと・全体の数を出す（対象外・入社年で外れた人は数に入れない）", () => {
    const p = requestProgress(items, [w1, w2], checks);
    expect(p.items[0]).toMatchObject({ total: 2, informed: 2, issued: 1, sent: 1, notNeeded: 0 });
    // 源泉徴収票: w1 は対象外にした、w2 は 2025 年入社なので自動で外れる
    expect(p.items[1]).toMatchObject({ total: 0, informed: 0, issued: 0, sent: 0, notNeeded: 2 });
    expect(p.total).toBe(2);
    expect(p.sent).toBe(1);
    expect(p.done).toBe(false);
  });

  it("全部送ったら完了。対象が無ければ完了にしない", () => {
    expect(requestProgress(items, [w1], [checks[0], checks[2]]).done).toBe(true);
    expect(requestProgress(items, [], []).done).toBe(false);
  });

  it("その人のまだの項目（入社年で外れる書類は含めない）", () => {
    const idx = indexChecks(checks);
    expect(workerPending(items, w1, idx)).toEqual([]);
    expect(workerPending(items, w2, idx).map((i) => i.id)).toEqual(["a"]);
    expect(workerPending(items, { id: "w3", startOn: "2026-05-01" }, idx).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("期限の表示", () => {
    expect(daysToDue("2026-11-09", "2026-10-19")).toBe(21);
    expect(dueLabel("2026-11-09", "2026-10-19")).toBe("あと21日");
    expect(dueLabel("2026-10-19", "2026-10-19")).toBe("今日まで");
    expect(dueLabel("2026-10-17", "2026-10-19")).toBe("2日過ぎ");
    expect(dueLabel(null, "2026-10-19")).toBe("");
  });
});

describe("チェック表の絞り込み（国籍・入社年）", () => {
  const ws = [
    { id: "a", nationality: "インドネシア", startOn: "2026-08-20" },
    { id: "b", nationality: "ベトナム", startOn: "2025-04-01" },
    { id: "c", nationality: "", startOn: null },
    { id: "d", nationality: "インドネシア", startOn: "2026-01-10" },
  ];
  it("選択肢は国籍（未登録は最後）・入社年（新しい順。未登録あり）", () => {
    expect(nationalityOptions(ws)).toEqual(["インドネシア", "ベトナム", "未登録"]);
    expect(joinedYearOptions(ws)).toEqual(["2026", "2025", "未登録"]);
  });
  it("国籍・入社年で絞り込める（組み合わせも）", () => {
    expect(filterRequestWorkers(ws, { nationality: "インドネシア", joinedYear: "" }).map((w) => w.id)).toEqual(["a", "d"]);
    expect(filterRequestWorkers(ws, { nationality: "", joinedYear: "2025" }).map((w) => w.id)).toEqual(["b"]);
    expect(filterRequestWorkers(ws, { nationality: "", joinedYear: "未登録" }).map((w) => w.id)).toEqual(["c"]);
    expect(filterRequestWorkers(ws, { nationality: "未登録", joinedYear: "" }).map((w) => w.id)).toEqual(["c"]);
    expect(filterRequestWorkers(ws, { nationality: "インドネシア", joinedYear: "2026" }).map((w) => w.id)).toEqual(["a", "d"]);
    expect(filterRequestWorkers(ws, { nationality: "", joinedYear: "" })).toHaveLength(4);
  });
});

describe("外国人詳細の入社書類との突き合わせ", () => {
  it("年・括弧書き・等を除いて比べる", () => {
    expect(normalizeDocName("扶養控除等申告書")).toBe("扶養控除申告書");
    expect(normalizeDocName("扶養証明書（日本語翻訳）")).toBe("扶養証明書");
    expect(normalizeDocName("令和8年度源泉徴収票")).toBe("源泉徴収票");
    expect(normalizeDocName("２０２６年送金証明書 の写し")).toBe("送金証明書");
    expect(docNameReiwaYear("令和8年度源泉徴収票")).toBe(8);
    expect(docNameReiwaYear("2026年源泉徴収票")).toBe(8);
    expect(docNameReiwaYear("扶養控除申告書")).toBeNull();
  });
  it("扶養控除申告書 ↔ 扶養控除等申告書、扶養証明書(日本語訳) ↔ 扶養証明書（日本語翻訳）が同じ書類になる", () => {
    expect(matchesOnboardingDoc("扶養控除申告書", { doc_key: "fuyokojo", label: "扶養控除等申告書" })).toBe(true);
    expect(matchesOnboardingDoc("扶養証明書(日本語訳)", { doc_key: "fuyo", label: "扶養証明書（日本語翻訳）" })).toBe(true);
    expect(matchesOnboardingDoc("扶養控除申告書", { doc_key: "fuyo", label: "扶養証明書（日本語翻訳）" })).toBe(false);
    expect(matchesOnboardingDoc("送金証明書", { doc_key: "tsuchou", label: "通帳の見開き" })).toBe(false);
  });
  it("源泉徴収票は年が合うものだけ（年の指定が無ければどの年でも）", () => {
    const r8 = { doc_key: "gensen_r8", label: "令和8年分源泉徴収票" };
    const r7 = { doc_key: "gensen_r7", label: "令和7年分源泉徴収票" };
    expect(matchesOnboardingDoc("令和8年度源泉徴収票", r8)).toBe(true);
    expect(matchesOnboardingDoc("令和8年度源泉徴収票", r7)).toBe(false);
    expect(matchesOnboardingDoc("2025年源泉徴収票", r7)).toBe(true);
    expect(matchesOnboardingDoc("源泉徴収票", r7)).toBe(true);
    expect(findOnboardingDocFor("令和8年度源泉徴収票", [r7, r8])).toBe(r8);
    expect(findOnboardingDocFor("住民票", [r7, r8])).toBeNull();
  });
});
