import { describe, expect, it } from "vitest";
import {
  checkState,
  daysToDue,
  dueLabel,
  emptyCheck,
  indexChecks,
  itemsToText,
  normalizeItems,
  parseItemsText,
  requestProgress,
  toggleStep,
  workerPending,
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
      { id: "i1", name: "扶養控除申告書", note: "" },
      { id: "i2", name: "扶養証明書(日本語訳)", note: "コピーでいいです" },
      { id: "i3", name: "送金証明書", note: "" },
      { id: "i4", name: "令和8年度源泉徴収票", note: "2026年入社の方" },
    ]);
  });

  it("項目をテキストに戻せる", () => {
    expect(itemsToText([{ id: "a", name: "送金証明書", note: "" }, { id: "b", name: "源泉徴収票", note: "2026年入社の方" }])).toBe(
      "送金証明書\n源泉徴収票｜2026年入社の方",
    );
  });

  it("DB の jsonb が壊れていても落ちない", () => {
    expect(normalizeItems(null)).toEqual([]);
    expect(normalizeItems([{ name: " 送金証明書 " }, { id: "x", name: "", note: "" }, "bad", { id: "y", name: "源泉", note: 1 }])).toEqual([
      { id: "item0", name: "送金証明書", note: "" },
      { id: "y", name: "源泉", note: "" },
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
    { id: "a", name: "扶養控除申告書", note: "" },
    { id: "b", name: "源泉徴収票", note: "2026年入社の方" },
  ];
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

  it("項目ごと・全体の数を出す（対象外は数に入れない）", () => {
    const p = requestProgress(items, ["w1", "w2"], checks);
    expect(p.items[0]).toMatchObject({ total: 2, informed: 2, issued: 1, sent: 1, notNeeded: 0 });
    expect(p.items[1]).toMatchObject({ total: 1, informed: 0, issued: 0, sent: 0, notNeeded: 1 });
    expect(p.total).toBe(3);
    expect(p.sent).toBe(1);
    expect(p.done).toBe(false);
  });

  it("全部送ったら完了。対象が無ければ完了にしない", () => {
    expect(requestProgress(items, ["w1"], [checks[0], checks[2]]).done).toBe(true);
    expect(requestProgress(items, [], []).done).toBe(false);
  });

  it("その人のまだの項目", () => {
    const idx = indexChecks(checks);
    expect(workerPending(items, "w1", idx)).toEqual([]);
    expect(workerPending(items, "w2", idx).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("期限の表示", () => {
    expect(daysToDue("2026-11-09", "2026-10-19")).toBe(21);
    expect(dueLabel("2026-11-09", "2026-10-19")).toBe("あと21日");
    expect(dueLabel("2026-10-19", "2026-10-19")).toBe("今日まで");
    expect(dueLabel("2026-10-17", "2026-10-19")).toBe("2日過ぎ");
    expect(dueLabel(null, "2026-10-19")).toBe("");
  });
});
