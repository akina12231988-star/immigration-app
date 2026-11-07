import { describe, expect, it } from "vitest";
import { orgSalesStatus } from "./org-sales-status";

describe("orgSalesStatus（所属機関の売上明細の登録状況）", () => {
  it("何も登録していない機関は既定のまま・印紙代の負担未設定", () => {
    const s = orgSalesStatus({ id: "o1", name: "株式会社さくら", intake: {} });
    expect(s.kinds.every((k) => k.state === "default")).toBe(true);
    expect(s.stampFeePayer).toBe("");
    expect(s.unregisteredCount).toBe(6);
    expect(s.kinds.find((k) => k.kind === "特定技能申請")?.total).toBe(78500 + 5000 + 12500);
  });

  it("この機関だけの明細を登録した種別は登録済み、空にした種別は明細なし", () => {
    const s = orgSalesStatus({
      id: "o1",
      name: "株式会社さくら",
      intake: {
        sales_items: { 特定技能更新申請: [{ name: "更新", amount: "20000" }], 特定活動申請: [] },
        sales_items_custom: ["特定技能更新申請", "特定活動申請"],
        stamp_fee_payer: "会社立替",
      },
    });
    expect(s.kinds.find((k) => k.kind === "特定技能更新申請")).toEqual({ kind: "特定技能更新申請", state: "custom", total: 20000 });
    expect(s.kinds.find((k) => k.kind === "特定活動申請")?.state).toBe("empty");
    expect(s.stampFeePayer).toBe("会社立替");
    expect(s.unregisteredCount).toBe(4);
  });
});
