import { describe, expect, it } from "vitest";
import {
  buildTaxRequestPlan,
  hasYearRequests,
  muniMoneyOrderGroup,
  planFiscalYears,
  recordMuniGroups,
  suggestRequestedYears,
  taxPlanBlockers,
} from "./tax-request-plan";
import { mainMailedTitles, nhiMailedTitles, type Municipality } from "./tax-cert";

function muni(id: string, name: string, patch: Partial<Municipality> = {}): Municipality {
  return {
    id,
    name,
    prefecture: "",
    website_url: "",
    cert_name: "課税証明書",
    has_income: true,
    has_tax: true,
    needs_tax_payment_cert: false,
    show_asterisk: false,
    note: "",
    tenshutsu_self_only: false,
    juminhyo_self_only: false,
    ...patch,
  };
}

const setagaya = muni("m1", "東京都世田谷区");
const arakawa = muni("m2", "東京都荒川区");
const hikawa = muni("m3", "八代郡氷川町");
const sep = new Date("2026-09-23T00:00:00");

describe("planFiscalYears", () => {
  it("6月で最新年度が切り替わる", () => {
    expect(planFiscalYears(sep)).toEqual({ new: 2026, prev: 2025 });
    expect(planFiscalYears(new Date("2026-05-31T00:00:00"))).toEqual({ new: 2025, prev: 2024 });
  });
});

describe("suggestRequestedYears", () => {
  it("特別徴収は前年度", () => {
    expect(suggestRequestedYears({ newMuni: setagaya, newCollection: "special", appDate: sep })).toMatchObject({ new: false, prev: true });
  });
  it("普通徴収は1〜5月なら最新年度", () => {
    const r = suggestRequestedYears({ newMuni: setagaya, newCollection: "normal", appDate: new Date("2026-03-01T00:00:00") });
    expect(r).toMatchObject({ new: true, prev: false });
  });
  it("最新年度の自治体が＊表示なら最新年度", () => {
    const r = suggestRequestedYears({ newMuni: muni("s", "S", { show_asterisk: true }), newCollection: "special", appDate: sep });
    expect(r.new).toBe(true);
  });
});

describe("buildTaxRequestPlan", () => {
  it("年度ごとに違う自治体へ、年度ごとの徴収区分で請求する", () => {
    const plan = buildTaxRequestPlan({
      appDate: sep,
      years: [
        { yearType: "prev", muni: arakawa, collectionType: "special", requested: true, nhi: false, nhiMuni: null },
        { yearType: "new", muni: setagaya, collectionType: "normal", requested: true, nhi: false, nhiMuni: null },
      ],
    });
    expect(plan.years.map((y) => [y.yearType, y.fiscalStartYear, y.municipalityName, y.collectionType])).toEqual([
      ["new", 2026, "東京都世田谷区", "normal"],
      ["prev", 2025, "東京都荒川区", "special"],
    ]);
    expect(plan.groups.map((g) => [g.muni.name, g.docs.length])).toEqual([
      ["東京都世田谷区", 2],
      ["東京都荒川区", 2],
    ]);
    expect(plan.docs[0].title).toBe("東京都世田谷区：課税証明書（2026年度（令和8年度））");
    expect(plan.docs[1].title).toBe("東京都世田谷区：市県民税納税証明書（2026年度（令和8年度））");
  });

  it("国保は加入していた年度ごとに、その請求先の自治体へまとめる", () => {
    const plan = buildTaxRequestPlan({
      appDate: sep,
      years: [
        { yearType: "new", muni: setagaya, collectionType: "special", requested: false, nhi: true, nhiMuni: hikawa },
        { yearType: "prev", muni: setagaya, collectionType: "special", requested: true, nhi: true, nhiMuni: setagaya },
      ],
    });
    expect(plan.years).toHaveLength(1);
    expect(plan.nhiYears.map((y) => [y.fiscalStartYear, y.municipalityName])).toEqual([
      [2026, "八代郡氷川町"],
      [2025, "東京都世田谷区"],
    ]);
    // 世田谷区: 前年度の課税・納税 ＋ 前年度の国保 / 氷川町: 最新年度の国保
    expect(plan.groups.map((g) => [g.muni.name, g.docs.map((d) => !!d.isNhi)])).toEqual([
      ["東京都世田谷区", [false, false, true]],
      ["八代郡氷川町", [true]],
    ]);
  });

  it("前年度の特別徴収は6月前半に注意を出す", () => {
    const plan = buildTaxRequestPlan({
      appDate: new Date("2026-06-05T00:00:00"),
      years: [{ yearType: "prev", muni: setagaya, collectionType: "special", requested: true, nhi: false, nhiMuni: null }],
    });
    expect(plan.years[0].timingStatus).toBe("warn");
  });
});

describe("taxPlanBlockers", () => {
  it("未選択を理由ごとに返す", () => {
    const r = taxPlanBlockers({ newMuni: null, prevMuni: null, appDate: "", years: [{ yearType: "new", nhi: true, nhiMuni: null }] });
    expect(r).toHaveLength(4);
    expect(taxPlanBlockers({ newMuni: setagaya, prevMuni: setagaya, appDate: "2026-09-23", years: [] })).toEqual([]);
  });
});

describe("保存した記録の定額小為替", () => {
  const plan = buildTaxRequestPlan({
    appDate: sep,
    years: [
      { yearType: "new", muni: setagaya, collectionType: "normal", requested: true, nhi: true, nhiMuni: hikawa },
      { yearType: "prev", muni: arakawa, collectionType: "special", requested: false, nhi: false, nhiMuni: null },
    ],
  });
  it("自治体ごとにまとめ直せる", () => {
    expect(recordMuniGroups(plan.docs).map((g) => [g.municipalityId, g.titles.length])).toEqual([
      ["m1", 2],
      ["m3", 1],
    ]);
    expect(muniMoneyOrderGroup("m1")).toBe("muni:m1");
  });
  it("郵送する証明書は国保も含めて1つの欄で数える", () => {
    const r = { yearRequests: plan.years, requestMethod: "mail" as const, hasNhi: true, docs: plan.docs };
    expect(hasYearRequests(r)).toBe(true);
    expect(mainMailedTitles(r)).toHaveLength(3);
    expect(nhiMailedTitles(r)).toEqual([]);
    expect(hasYearRequests({})).toBe(false);
  });
});
