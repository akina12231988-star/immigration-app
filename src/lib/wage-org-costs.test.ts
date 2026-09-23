import { describe, expect, it } from "vitest";
import { emptyWageDetail } from "./wage-calc";
import { applyOrgCosts, matchesOrgCosts, orgCosts } from "./wage-org-costs";

describe("orgCosts", () => {
  it("所属機関の水道光熱費・通信費を数字にする（無しは0、固定は固定額）", () => {
    expect(orgCosts({ posting_utility_cost: "5,000", posting_utility_kind: "固定", posting_comm_cost: "無し" })).toEqual({
      utilityKind: "固定額",
      utility: 5000,
      comm: 0,
      registered: true,
    });
    expect(orgCosts(null).registered).toBe(false);
  });
});

describe("applyOrgCosts / matchesOrgCosts", () => {
  it("水道光熱費を (f) に、通信費をその他控除の「通信費」に入れ、入れ直しても行が重ならない", () => {
    const costs = orgCosts({ posting_utility_cost: "5000", posting_utility_kind: "実費", posting_comm_cost: "約3000円" });
    const base = { ...emptyWageDetail(), others: [{ name: "作業着代", amount: 1000 }] };
    expect(matchesOrgCosts(base, costs)).toBe(false);
    const once = applyOrgCosts(base, costs);
    const twice = applyOrgCosts(once, costs);
    expect(twice.utility_amount).toBe(5000);
    expect(twice.utility_kind).toBe("実費");
    expect(twice.others).toEqual([
      { name: "作業着代", amount: 1000 },
      { name: "通信費", amount: 3000 },
    ]);
    expect(matchesOrgCosts(twice, costs)).toBe(true);
  });
  it("通信費が無しなら「通信費」の行を外す", () => {
    const d = { ...emptyWageDetail(), others: [{ name: "通信費", amount: 3000 }] };
    expect(applyOrgCosts(d, orgCosts({ posting_comm_cost: "無し" })).others).toEqual([]);
  });
});
