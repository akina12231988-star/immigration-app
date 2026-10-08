import { describe, expect, it } from "vitest";
import {
  buildWageRaiseRows,
  isSsw2Residence,
  parseYen,
  proposedWage,
  wageRaiseNote,
  wageRaiseSummary,
} from "@/lib/wage-raise";

const w = (id: string, over: Partial<Parameters<typeof buildWageRaiseRows>[0][number]> = {}) => ({
  id,
  name: id,
  residenceStatus: "特定技能1号",
  status: "在籍中",
  wageKind: "時給" as string | null,
  wageAmount: 1000 as number | null,
  wageStartedOn: "2025-04-01" as string | null,
  ...over,
});
const amounts = { ssw1: 1100, ssw2: 1150 };

describe("時給の一括登録", () => {
  it("在留資格から金額を仮に決める（2号は2号の金額、特定活動の2号移行準備も2号）", () => {
    expect(isSsw2Residence("特定技能2号")).toBe(true);
    expect(isSsw2Residence("特定技能２号")).toBe(true);
    expect(isSsw2Residence("特定活動（特定技能2号移行準備）")).toBe(true);
    expect(isSsw2Residence("特定技能1号")).toBe(false);
    expect(proposedWage("特定技能1号", amounts)).toBe(1100);
    expect(proposedWage("特定技能2号", amounts)).toBe(1150);
    expect(proposedWage("特定活動（特定技能1号移行準備）", amounts)).toBe(1100);
    expect(proposedWage("特定技能1号", { ssw1: 0, ssw2: 1150 })).toBeNull();
  });

  it("金額の入力は数字だけを拾う", () => {
    expect(parseYen("1,100")).toBe(1100);
    expect(parseYen("１１５０円")).toBe(1150);
    expect(parseYen("")).toBe(0);
    expect(parseYen("abc")).toBe(0);
  });

  it("在籍中 → 審査中・受け取り待ち → 準備中 の順で、同じ人は1回だけ", () => {
    const active = [w("b"), w("a")];
    const notYet = [w("d", { status: "申請準備中" }), w("c", { status: "申請準備中" })];
    const applying = [w("e", { status: "申請準備中" }), w("a")];
    const rows = buildWageRaiseRows(active, notYet, applying, new Set(["c"]), amounts, "2026-11-01");
    expect(rows.map((r) => [r.worker.id, r.group])).toEqual([
      ["a", "在籍中"],
      ["b", "在籍中"],
      ["c", "審査中・受け取り待ち"],
      ["e", "審査中・受け取り待ち"],
      ["d", "準備中"],
    ]);
    expect(rows.every((r) => r.proposed === 1100 && r.checked)).toBe(true);
  });

  it("確認してほしい人には注意を付け、時給以外・登録済みの人はチェックを外す", () => {
    const rows = buildWageRaiseRows(
      [
        w("特定活動", { residenceStatus: "特定活動（特定技能1号移行準備）" }),
        w("月給", { wageKind: "月給", wageAmount: 200000 }),
        w("登録済み", { wageAmount: 1100, wageStartedOn: "2026-11-01" }),
        w("古い同額", { wageAmount: 1100, wageStartedOn: "2025-04-01" }),
        w("未登録", { residenceStatus: "" }),
        w("2号", { residenceStatus: "特定技能2号", wageAmount: 1100 }),
      ],
      [],
      [],
      new Set(),
      amounts,
      "2026-11-01",
    );
    const by = Object.fromEntries(rows.map((r) => [r.worker.id, r]));
    expect(by["特定活動"]).toMatchObject({ checked: true, proposed: 1100 });
    expect(by["特定活動"].note).toMatch(/特定活動/);
    expect(by["月給"]).toMatchObject({ checked: false, proposed: 1100 });
    expect(by["月給"].note).toMatch(/時給ではありません/);
    expect(by["登録済み"]).toMatchObject({ checked: false });
    expect(by["登録済み"].note).toMatch(/登録済み/);
    expect(by["古い同額"]).toMatchObject({ checked: true, note: "" });
    expect(by["未登録"]).toMatchObject({ checked: true });
    expect(by["未登録"].note).toMatch(/未登録/);
    expect(by["2号"]).toMatchObject({ checked: true, proposed: 1150, note: "" });
  });

  it("金額が未入力なら対象にしない", () => {
    const rows = buildWageRaiseRows([w("a")], [], [], new Set(), { ssw1: 0, ssw2: 0 }, "2026-11-01");
    expect(rows[0]).toMatchObject({ proposed: null, checked: false });
  });

  it("内訳の数え方と備考", () => {
    const rows = buildWageRaiseRows(
      [w("a"), w("b")],
      [w("c", { status: "申請準備中" })],
      [],
      new Set(),
      amounts,
      "2026-11-01",
    );
    const s = wageRaiseSummary(rows, (r) => r.worker.id !== "b");
    expect(s.total).toBe(2);
    expect(s.byGroup).toEqual({ 在籍中: 1, "審査中・受け取り待ち": 0, 準備中: 1 });
    expect(wageRaiseNote("2026-11-01")).toBe("時給の一括登録（2026-11-01から）");
  });
});
