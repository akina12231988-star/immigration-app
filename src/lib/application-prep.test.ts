import { describe, expect, it } from "vitest";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  isRequired,
  isSatisfied,
  PREP_DOC_DEFS,
  prepDocLabel,
  type PrepChecklistMeta,
  type PrepDocSources,
} from "./application-prep";

const TODAY = "2026-07-23";

function meta(over: Partial<PrepChecklistMeta>): PrepChecklistMeta {
  return { ...EMPTY_PREP_META, ...over };
}
function sources(over: Partial<PrepDocSources>): PrepDocSources {
  return { filledDocKeys: new Set(), photoPath: null, healthCheckOn: null, ...over };
}
const def = (id: string) => PREP_DOC_DEFS.find((d) => d.id === id)!;

describe("isRequired", () => {
  it("申請種別未選択なら何も必要にならない", () => {
    expect(isRequired(def("zairyu"), meta({}))).toBe(false);
  });

  it("変更申請では健康診断書・保険証が必要、更新では不要", () => {
    expect(isRequired(def("kenshin"), meta({ app_type: "変更" }))).toBe(true);
    expect(isRequired(def("kenshin"), meta({ app_type: "更新" }))).toBe(false);
  });

  it("国保加入時のみ国保税納税証明書・保険証が必要", () => {
    expect(isRequired(def("nozei_kokuho"), meta({ app_type: "更新" }))).toBe(false);
    expect(isRequired(def("nozei_kokuho"), meta({ app_type: "更新", has_kokuho: true }))).toBe(true);
    expect(isRequired(def("hokensho"), meta({ app_type: "変更", has_kokuho: true }))).toBe(true);
  });

  it("年金記録は国民年金加入時のみ必要", () => {
    expect(isRequired(def("nenkin"), meta({ app_type: "変更" }))).toBe(false);
    expect(isRequired(def("nenkin"), meta({ app_type: "変更", has_nenkin: true }))).toBe(true);
  });
});

describe("isSatisfied", () => {
  it("在留カードは cert_zairyu のファイルがあれば充足", () => {
    expect(isSatisfied(def("zairyu"), meta({}), sources({}), TODAY)).toBe(false);
    expect(
      isSatisfied(def("zairyu"), meta({}), sources({ filledDocKeys: new Set(["cert_zairyu"]) }), TODAY),
    ).toBe(true);
  });

  it("顔写真は photo_path があれば充足", () => {
    expect(isSatisfied(def("photo"), meta({}), sources({ photoPath: "p.jpg" }), TODAY)).toBe(true);
  });

  it("源泉徴収票は対象年度の gensen_r{年} があれば充足", () => {
    const m = meta({ target_reiwa: 7 });
    expect(isSatisfied(def("gensen"), m, sources({ filledDocKeys: new Set(["gensen_r7"]) }), TODAY)).toBe(true);
    expect(isSatisfied(def("gensen"), m, sources({ filledDocKeys: new Set(["gensen_r6"]) }), TODAY)).toBe(false);
  });

  it("健康診断書はファイル・受診日1年以内・項目確認の3点で充足", () => {
    const filled = new Set(["kenshin"]);
    // 項目未確認 → 不足
    expect(
      isSatisfied(def("kenshin"), meta({}), sources({ filledDocKeys: filled, healthCheckOn: "2026-05-01" }), TODAY),
    ).toBe(false);
    // 3点そろう → 充足
    expect(
      isSatisfied(
        def("kenshin"),
        meta({ kenshin_items_ok: true }),
        sources({ filledDocKeys: filled, healthCheckOn: "2026-05-01" }),
        TODAY,
      ),
    ).toBe(true);
    // 受診日が1年超 → 不足
    expect(
      isSatisfied(
        def("kenshin"),
        meta({ kenshin_items_ok: true }),
        sources({ filledDocKeys: filled, healthCheckOn: "2025-01-01" }),
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("evaluatePrepChecklist", () => {
  it("更新・国保&年金加入で必要書類と不足を集計する", () => {
    const m = meta({ app_type: "更新", has_kokuho: true, has_nenkin: true, target_reiwa: 7 });
    const { items, missing } = evaluatePrepChecklist(
      m,
      sources({ filledDocKeys: new Set(["cert_zairyu", "gensen_r7"]), photoPath: "p.jpg" }),
      TODAY,
    );
    // 更新の必要書類: 在留カード/顔写真/パスポート/源泉/課税/納税(市県民)/納税(国保)/年金記録 = 8件
    expect(items).toHaveLength(8);
    // 充足: 在留カード・顔写真・源泉 → 不足は 5件
    expect(missing.map((x) => x.def.id).sort()).toEqual(
      ["kazei", "nenkin", "nozei_kokuho", "nozei_shiken", "passport"].sort(),
    );
  });
});

describe("prepDocLabel", () => {
  it("年度つき書類は令和年を付ける", () => {
    expect(prepDocLabel(def("kazei"), 7)).toBe("令和7年度 課税証明書");
    expect(prepDocLabel(def("gensen"), 6)).toBe("令和6年分 源泉徴収票");
    expect(prepDocLabel(def("zairyu"), 7)).toBe("在留カード（両面・現住所がわかるもの）");
  });
});
