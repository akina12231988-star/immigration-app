import { describe, expect, it } from "vitest";
import { copySalesSettings, orgSalesStatus } from "./org-sales-status";

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

describe("copySalesSettings（他の機関の登録内容のコピー）", () => {
  it("選んだ種別の明細と印紙代の負担を、コピー先のこの機関だけの明細として登録する（ほかの項目は残す）", () => {
    const source = {
      name: "株式会社さくら",
      intake: { sales_items: { 特定技能更新申請: [{ name: "更新", amount: "20000" }] }, sales_items_custom: ["特定技能更新申請"], stamp_fee_payer: "会社立替" },
    };
    const target = { rep_name: "代表 太郎", sales_items: { 特定活動申請: [{ name: "活動", amount: "1" }] }, sales_items_custom: ["特定活動申請"] };
    const out = copySalesSettings(source, target, ["特定技能更新申請", "特定技能申請"], true);
    expect(out.rep_name).toBe("代表 太郎");
    const items = out.sales_items as Record<string, { name: string; amount: string }[]>;
    expect(items["特定技能更新申請"]).toEqual([{ name: "更新", amount: "20000" }]);
    // コピー元が既定の明細なら、その機関で使っている既定の内容（さくらは78,500円）をコピーする
    expect(items["特定技能申請"][0].amount).toBe("78500");
    expect(items["特定活動申請"]).toEqual([{ name: "活動", amount: "1" }]);
    expect(out.sales_items_custom).toEqual(["特定活動申請", "特定技能更新申請", "特定技能申請"]);
    expect(out.stamp_fee_payer).toBe("会社立替");
    expect(orgSalesStatus({ id: "t", name: "T", intake: out }).kinds.find((k) => k.kind === "特定技能申請")?.state).toBe("custom");
  });

  it("印紙代をコピーしないときは負担を変えない", () => {
    const out = copySalesSettings({ name: "A", intake: { stamp_fee_payer: "会社負担" } }, { stamp_fee_payer: "本人負担" }, [], false);
    expect(out.stamp_fee_payer).toBe("本人負担");
  });
});
