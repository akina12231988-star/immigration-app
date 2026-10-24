import { describe, expect, it } from "vitest";
import {
  buildPastPeriods,
  docPeriodDate,
  manualPeriodKey,
  manualPeriodLabel,
  orderPeriodTabs,
  periodKeyFor,
  periodKeyForDoc,
  periodLabelFor,
  sortDocsByPeriodDate,
  visaRowsForDocTab,
} from "./worker-doc-periods";
import type { WorkHistoryRow } from "@/types/db";

const TODAY = "2026-08-18";

function history(over: Partial<WorkHistoryRow>): WorkHistoryRow {
  return {
    id: "h1",
    worker_id: "w1",
    org_name: "株式会社テスト",
    visa: "特定技能1号",
    start_date: "2024-04-01",
    end_date: null,
    job_type: "",
    note: "",
    created_at: "",
    updated_at: "",
    ...over,
  } as WorkHistoryRow;
}

describe("buildPastPeriods", () => {
  it("退職日が過ぎた在籍だけを過去の期間にする", () => {
    const rows = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].org).toBe("前の会社");
  });

  it("退職日が今日以降（まだ期間内）の在籍は過去にしない", () => {
    const rows = buildPastPeriods(
      [history({ org_name: "井上　洋介", start_date: "2026-08-10", end_date: "2027-02-10" })],
      TODAY,
    );
    expect(rows).toHaveLength(0);
  });

  it("在籍中（退職日なし）は過去にしない", () => {
    expect(buildPastPeriods([history({})], TODAY)).toHaveLength(0);
  });
});

describe("periodKeyFor", () => {
  it("今も期間内の在籍中に登録した画像は「現在」に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "井上　洋介", start_date: "2026-08-10", end_date: "2027-02-10" })],
      TODAY,
    );
    expect(periodKeyFor("2026-08-12T00:00:00Z", past, true)).toBe("current");
  });

  it("過去の在籍期間中に登録した画像はその期間に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(periodKeyFor("2024-05-01T00:00:00Z", past, true)).toBe(past[0].key);
  });

  it("最後の退職日より後に登録した画像は「現在」に出す", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(periodKeyFor("2026-08-12T00:00:00Z", past, true)).toBe("current");
  });

  it("タブにない期間（前の退職日より後・次の入社より前）の日付で登録した画像は「現在」に出す", () => {
    // 前の会社 2025-05-08〜2025-11-11 → 在留カード 2025-11-11〜（次の在籍との間）→ 現在
    const past = buildPastPeriods(
      [
        history({ org_name: "所属不明", start_date: "2023-10-07", end_date: "2025-05-07" }),
        history({ id: "h2", org_name: "前の会社", start_date: "2025-05-08", end_date: "2025-11-11" }),
        history({ id: "h3", org_name: "今の会社", start_date: "2026-01-15", end_date: null }),
      ],
      TODAY,
    );
    expect(periodKeyFor("2025-11-12", past, true)).toBe("current");
    // 前の会社の退職日ちょうどはその期間に入る
    expect(periodKeyFor("2025-11-11", past, true)).toBe(past[0].key);
  });

  it("過去タブから登録した画像（effective_on＝退職日）はその期間に出る", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    // 今日アップロードしても、effective_on を退職日にすれば過去の期間に振り分けられる
    expect(periodKeyFor("2026-07-31", past, true)).toBe(past[0].key);
  });
});

describe("docPeriodDate", () => {
  it("effective_on があれば登録日より優先する", () => {
    expect(
      docPeriodDate({ effectiveOn: "2026-07-31", createdAt: "2026-08-18T10:00:00Z" }),
    ).toBe("2026-07-31");
  });

  it("effective_on が無ければ登録日で判定する", () => {
    expect(docPeriodDate({ effectiveOn: null, createdAt: "2026-08-18T10:00:00Z" })).toBe(
      "2026-08-18",
    );
    expect(docPeriodDate({ createdAt: "2026-08-18T10:00:00Z" })).toBe("2026-08-18");
  });
});

describe("sortDocsByPeriodDate", () => {
  it("日付を指定して登録した古い在留カードは、登録が新しくても最新より後ろ（履歴）に並ぶ", () => {
    const current = { id: "a", effectiveOn: null, createdAt: "2026-03-01T00:00:00Z" };
    const older = { id: "b", effectiveOn: "2025-11-11", createdAt: "2026-10-24T00:00:00Z" };
    expect(sortDocsByPeriodDate([older, current]).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("同じ日付なら登録が新しいほうを先にする", () => {
    const a = { id: "a", createdAt: "2026-03-01T09:00:00Z" };
    const b = { id: "b", createdAt: "2026-03-01T10:00:00Z" };
    expect(sortDocsByPeriodDate([a, b]).map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("periodLabelFor", () => {
  it("過去の期間ならタブと同じ表示名、見つからなければ「現在」", () => {
    const past = buildPastPeriods(
      [history({ org_name: "前の会社", start_date: "2023-01-01", end_date: "2026-07-31" })],
      TODAY,
    );
    expect(periodLabelFor(past[0].key, past)).toBe("過去（前の会社）2023-01-01〜2026-07-31");
    expect(periodLabelFor("current", past)).toBe("現在");
  });
});

describe("追加した期間（periodKeyForDoc・manualPeriodLabel）", () => {
  const past = buildPastPeriods(
    [history({ org_name: "前の会社", start_date: "2025-05-08", end_date: "2025-11-11" })],
    TODAY,
  );
  const manual = { id: "p1", label: "", startOn: "2025-11-11", endOn: "2026-11-11" };

  it("期間IDが付いた画像は、日付が過去の在籍期間と重なっていても追加した期間のタブに出す", () => {
    const doc = { periodId: "p1", effectiveOn: "2025-11-11", createdAt: "2026-10-24T00:00:00Z" };
    expect(periodKeyForDoc(doc, past, true)).toBe(manualPeriodKey("p1"));
  });

  it("期間IDが無い画像はこれまでどおり日付で振り分ける", () => {
    expect(
      periodKeyForDoc({ effectiveOn: "2025-11-11", createdAt: "2026-10-24T00:00:00Z" }, past, true),
    ).toBe(past[0].key);
    expect(periodKeyForDoc({ createdAt: "2026-10-24T00:00:00Z" }, past, true)).toBe("current");
  });

  it("表示名は名前があれば「名前 開始〜終了」、無ければ「開始〜終了」（終了日が無ければ開始〜）", () => {
    expect(manualPeriodLabel(manual)).toBe("2025-11-11〜2026-11-11");
    expect(manualPeriodLabel({ ...manual, label: "在留カード更新前" })).toBe(
      "在留カード更新前 2025-11-11〜2026-11-11",
    );
    expect(manualPeriodLabel({ ...manual, endOn: null })).toBe("2025-11-11〜");
    expect(periodLabelFor(manualPeriodKey("p1"), past, [manual])).toBe("2025-11-11〜2026-11-11");
  });
});

describe("orderPeriodTabs", () => {
  it("過去の在籍期間と追加した期間を混ぜて、開始日の新しい順（左が新しい）に並べる", () => {
    const past = buildPastPeriods(
      [
        history({ org_name: "所属不明", start_date: "2023-10-07", end_date: "2025-05-07" }),
        history({ id: "h2", org_name: "前の会社", start_date: "2025-05-08", end_date: "2025-11-11" }),
      ],
      TODAY,
    );
    const tabs = orderPeriodTabs(past, [
      { id: "p1", label: "前の会社", startOn: "2025-11-11", endOn: "2026-11-11" },
      { id: "p2", label: "", startOn: "2022-01-01", endOn: "2023-10-06" },
    ]);
    expect(tabs.map((t) => t.label)).toEqual([
      "前の会社 2025-11-11〜2026-11-11",
      "過去（前の会社）2025-05-08〜2025-11-11",
      "過去（所属不明）2023-10-07〜2025-05-07",
      "2022-01-01〜2023-10-06",
    ]);
    expect(tabs[0].manual?.id).toBe("p1");
    expect(tabs[1].manual).toBeNull();
  });
});

describe("visaRowsForDocTab", () => {
  const past = buildPastPeriods(
    [history({ org_name: "前の会社", start_date: "2025-05-08", end_date: "2025-11-11" })],
    TODAY,
  );
  const manual = [{ id: "p1", label: "", startOn: "2025-11-11", endOn: "2026-11-11" }];
  const rows = [
    { permitDate: "2025-05-10", cardNo: "A" }, // 前の会社の在籍中
    { permitDate: "2025-11-11", cardNo: "B" }, // 退職日と同じ日 → 追加した期間が優先
    { permitDate: "2026-07-01", cardNo: "C" }, // 追加した期間の中
    { permitDate: "2027-01-01", cardNo: "D" }, // どこにも入らない → 現在
  ];

  it("許可日で、追加した期間 → 過去の在籍期間 → 現在 の順に振り分ける", () => {
    expect(visaRowsForDocTab(rows, manualPeriodKey("p1"), past, manual).map((r) => r.cardNo)).toEqual(["B", "C"]);
    expect(visaRowsForDocTab(rows, past[0].key, past, manual).map((r) => r.cardNo)).toEqual(["A"]);
    expect(visaRowsForDocTab(rows, "current", past, manual).map((r) => r.cardNo)).toEqual(["D"]);
  });

  it("追加した期間に終了日が無ければ、開始日以降はすべてその期間", () => {
    const open = [{ id: "p2", label: "", startOn: "2026-01-01", endOn: null }];
    expect(visaRowsForDocTab(rows, manualPeriodKey("p2"), past, open).map((r) => r.cardNo)).toEqual(["C", "D"]);
  });
});
