import { describe, expect, it } from "vitest";
import {
  buildOrgWageData,
  buildWageReplyViews,
  countByStatus,
  derivedReplyAmounts,
  diffText,
  median,
  minimumWageForRound,
  modeAmount,
  overallStat,
  parseHourlyInput,
  regionOfAddress,
  regionStats,
  samplesFromCurrentWages,
  samplesFromReplies,
  type OrganizationWageReply,
  type OrgWageData,
  type WageStatsWage,
  type WageStatsWorker,
} from "@/lib/wage-stats";

const TODAY = "2026-10-16";

describe("regionOfAddress", () => {
  it("都道府県と市を読み取る（郵便番号付きでも）", () => {
    expect(regionOfAddress("〒866-0001 熊本県八代市郡築1番町1")).toEqual({ prefecture: "熊本県", city: "八代市" });
    expect(regionOfAddress("熊本県熊本市中央区水前寺1-1")).toEqual({ prefecture: "熊本県", city: "熊本市" });
  });
  it("郡部は郡と町村をつなげる", () => {
    expect(regionOfAddress("熊本県球磨郡あさぎり町免田東1")).toEqual({ prefecture: "熊本県", city: "球磨郡あさぎり町" });
    expect(regionOfAddress("熊本県上益城郡御船町1")).toEqual({ prefecture: "熊本県", city: "上益城郡御船町" });
  });
  it("「郡」を含む市名は市まで", () => {
    expect(regionOfAddress("福島県郡山市1")).toEqual({ prefecture: "福島県", city: "郡山市" });
  });
  it("東京都の区、都道府県の無い住所、空", () => {
    expect(regionOfAddress("東京都千代田区1")).toEqual({ prefecture: "東京都", city: "千代田区" });
    expect(regionOfAddress("八代市鏡町1")).toEqual({ prefecture: "", city: "八代市" });
    expect(regionOfAddress("")).toEqual({ prefecture: "", city: "" });
  });
});

const worker = (over: Partial<WageStatsWorker>): WageStatsWorker => ({
  id: "w1",
  name: "A",
  status: "在籍中",
  residence_status: "特定技能1号",
  current_organization_id: "o1",
  employment_start_on: "2024-04-01",
  org_employment_starts: [],
  ...over,
});
const wage = (over: Partial<WageStatsWage>): WageStatsWage => ({
  worker_id: "w1",
  organization_id: "o1",
  kind: "時給",
  amount: 1000,
  started_on: "2025-01-01",
  created_at: "2025-01-01T00:00:00Z",
  ...over,
});
const orgs = [
  { id: "o1", name: "A社", address: "熊本県八代市1", annual_work_hours: 2080 },
  { id: "o2", name: "B社", address: "熊本県球磨郡あさぎり町1" },
  { id: "o3", name: "C社", address: "" },
];

describe("buildOrgWageData", () => {
  it("在籍中の人だけを機関ごとにまとめ、現在の時給を出す", () => {
    const data = buildOrgWageData(
      orgs,
      [
        worker({ id: "w1" }),
        worker({ id: "w2", name: "B", residence_status: "特定技能2号" }),
        worker({ id: "w3", name: "C", status: "退職" }),
        worker({ id: "w4", name: "D", current_organization_id: "o2" }),
      ],
      [
        wage({ worker_id: "w1", amount: 1000, started_on: "2025-01-01" }),
        wage({ worker_id: "w1", amount: 1100, started_on: "2026-01-01" }),
        wage({ worker_id: "w1", amount: 1200, started_on: "2026-12-01" }), // まだ始まっていない
        wage({ worker_id: "w2", amount: 1300 }),
        wage({ worker_id: "w4", kind: "月給", amount: 200000, organization_id: "o2" }),
      ],
      TODAY,
    );
    expect(data.map((d) => d.workers.length)).toEqual([2, 1, 0]);
    const a = data[0].workers.find((w) => w.id === "w1")!;
    expect(a.currentHourly).toBe(1100);
    expect(a.group).toBe("1号");
    expect(a.hourlyWages.map((x) => x.amount)).toEqual([1000, 1100, 1200]);
    expect(data[0].workers.find((w) => w.id === "w2")!.group).toBe("2号");
    // 月給は年間所定労働時間が無ければ換算できない
    expect(data[1].workers[0].currentHourly).toBeNull();
    expect(data[1].workers[0].currentKind).toBe("月給");
  });

  it("月給は年間所定労働時間で時給に換算する", () => {
    const data = buildOrgWageData(orgs, [worker({})], [wage({ kind: "月給", amount: 208000 })], TODAY);
    expect(data[0].workers[0].currentHourly).toBe(1200);
  });
});

describe("derivedReplyAmounts / modeAmount", () => {
  it("改定日以降の時給から 1号・2号 それぞれいちばん多い額を出す", () => {
    const data: OrgWageData = {
      org: { id: "o1", name: "A", address: "" },
      region: { prefecture: "熊本県", city: "八代市" },
      workers: [
        { id: "1", name: "", group: "1号", currentHourly: 1100, currentKind: "時給", currentStartedOn: null, hourlyWages: [{ amount: 1100, startedOn: "2026-12-01" }] },
        { id: "2", name: "", group: "1号", currentHourly: 1100, currentKind: "時給", currentStartedOn: null, hourlyWages: [{ amount: 1100, startedOn: "2026-12-01" }] },
        { id: "3", name: "", group: "1号", currentHourly: 1150, currentKind: "時給", currentStartedOn: null, hourlyWages: [{ amount: 1150, startedOn: "2026-12-01" }] },
        { id: "4", name: "", group: "2号", currentHourly: 1300, currentKind: "時給", currentStartedOn: null, hourlyWages: [{ amount: 1300, startedOn: "2026-11-30" }] },
      ],
    };
    expect(derivedReplyAmounts(data, "2026-12-01")).toEqual({ "1号": 1100, "2号": null });
    expect(derivedReplyAmounts(data, "2026-11-01")).toEqual({ "1号": 1100, "2号": 1300 });
  });
  it("同数なら低いほう・空なら null", () => {
    expect(modeAmount([1200, 1100])).toBe(1100);
    expect(modeAmount([])).toBeNull();
  });
});

const reply = (over: Partial<OrganizationWageReply>): OrganizationWageReply => ({
  id: "r1",
  organization_id: "o1",
  effective_on: "2026-12-01",
  status: "送付済",
  sent_on: "2026-10-01",
  replied_on: null,
  hourly_ssw1: null,
  hourly_ssw2: null,
  note: "",
  created_at: "",
  updated_at: "",
  ...over,
});

describe("buildWageReplyViews", () => {
  const data = buildOrgWageData(
    orgs,
    [worker({ id: "w1" }), worker({ id: "w2", name: "B", current_organization_id: "o2" })],
    [
      wage({ worker_id: "w1", amount: 1100, started_on: "2026-12-01" }),
      wage({ worker_id: "w2", organization_id: "o2", amount: 1050, started_on: "2026-01-01" }),
    ],
    TODAY,
  );

  it("記録が無く改定日以降の時給が登録済みなら自動で「回答あり」", () => {
    const views = buildWageReplyViews(data, [], "2026-12-01");
    expect(views[0].status).toBe("回答あり");
    expect(views[0].autoReplied).toBe(true);
    expect(views[0].hourly).toEqual({ "1号": 1100, "2号": null });
    expect(views[0].hourlyFromWages["1号"]).toBe(true);
    expect(views[1].status).toBe("未送付");
    expect(views[2].status).toBe("未送付");
    expect(countByStatus(views)).toEqual({ 未送付: 2, 送付済: 0, 回答あり: 1, 対象外: 0 });
  });

  it("記録があればその内容を優先する（対象外は時給が登録済みでも変えない）", () => {
    const views = buildWageReplyViews(
      data,
      [
        reply({ organization_id: "o1", status: "対象外" }),
        reply({ id: "r2", organization_id: "o2", status: "回答あり", hourly_ssw1: 1080, replied_on: "2026-10-10" }),
      ],
      "2026-12-01",
    );
    expect(views[0].status).toBe("対象外");
    expect(views[0].autoReplied).toBe(false);
    expect(views[1].status).toBe("回答あり");
    expect(views[1].hourly["1号"]).toBe(1080);
    expect(views[1].hourlyFromWages["1号"]).toBe(false);
  });

  it("送付済の記録でも改定日以降の時給が登録されたら「回答あり」になる", () => {
    const views = buildWageReplyViews(data, [reply({ organization_id: "o1", status: "送付済" })], "2026-12-01");
    expect(views[0].status).toBe("回答あり");
    expect(views[0].autoReplied).toBe(true);
  });

  it("別の回（適用日）の記録は使わない", () => {
    const views = buildWageReplyViews(data, [reply({ organization_id: "o2", status: "回答あり", effective_on: "2025-11-01" })], "2026-12-01");
    expect(views[1].status).toBe("未送付");
    expect(views[1].reply).toBeNull();
  });
});

describe("regionStats", () => {
  const data = buildOrgWageData(
    orgs,
    [
      worker({ id: "w1" }),
      worker({ id: "w2", name: "B" }),
      worker({ id: "w3", name: "C", current_organization_id: "o2" }),
      worker({ id: "w4", name: "D", current_organization_id: "o3", residence_status: "特定技能2号" }),
    ],
    [
      wage({ worker_id: "w1", amount: 1100 }),
      wage({ worker_id: "w2", amount: 1200 }),
      wage({ worker_id: "w3", organization_id: "o2", amount: 1050 }),
      wage({ worker_id: "w4", organization_id: "o3", amount: 1300 }),
    ],
    TODAY,
  );
  const minimumFor = (p: string) => (p === "熊本県" ? 1034 : null);

  it("現在の時給を市区町村ごと・都道府県ごとに集計する", () => {
    const samples = samplesFromCurrentWages(data);
    const byCity = regionStats(samples, "city", minimumFor);
    expect(byCity.map((r) => r.label)).toEqual(["熊本県 八代市", "熊本県 球磨郡あさぎり町", "住所未登録・不明"]);
    expect(byCity[0].groups["1号"]).toEqual({ count: 2, orgCount: 1, average: 1150, median: 1150, min: 1100, max: 1200 });
    expect(byCity[0].minimum).toBe(1034);
    expect(byCity[2].groups["2号"]?.average).toBe(1300);
    expect(byCity[2].minimum).toBeNull();

    const byPref = regionStats(samples, "prefecture", minimumFor);
    expect(byPref.map((r) => r.label)).toEqual(["熊本県", "住所未登録・不明"]);
    expect(byPref[0].groups["1号"]).toEqual({ count: 3, orgCount: 2, average: 1117, median: 1100, min: 1050, max: 1200 });
    expect(overallStat(samples).groups["1号"]?.count).toBe(3);
    expect(overallStat(samples).orgCount).toBe(3);
  });

  it("回答は機関ごとに1件（回答ありの機関だけ）", () => {
    const views = buildWageReplyViews(
      data,
      [
        reply({ organization_id: "o1", status: "回答あり", hourly_ssw1: 1100, hourly_ssw2: 1250 }),
        reply({ id: "r2", organization_id: "o2", status: "送付済" }),
      ],
      "2026-12-01",
    );
    const samples = samplesFromReplies(views);
    expect(samples).toHaveLength(2);
    const stats = regionStats(samples, "prefecture", minimumFor);
    expect(stats[0].groups["1号"]?.count).toBe(1);
    expect(stats[0].groups["2号"]?.average).toBe(1250);
  });
});

describe("小さな部品", () => {
  it("median / parseHourlyInput / diffText", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
    expect(parseHourlyInput("１，１００円")).toBe(1100);
    expect(parseHourlyInput("")).toBeNull();
    expect(diffText(1100, 1034)).toBe("+66円");
    expect(diffText(1000, 1034)).toBe("−34円");
    expect(diffText(null, 1034)).toBe("");
  });
  it("minimumWageForRound は改定の都道府県だけ画面の額を使う", () => {
    const round = { prefecture: "熊本県", hourly: 1092, effectiveOn: "2026-12-01" };
    expect(minimumWageForRound("熊本県", round)).toBe(1092);
    expect(minimumWageForRound("福岡県", round)).toBeGreaterThan(1000);
    expect(minimumWageForRound("不明県", round)).toBeNull();
  });
});
