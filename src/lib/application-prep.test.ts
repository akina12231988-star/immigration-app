import { describe, expect, it } from "vitest";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  isRequired,
  isSatisfied,
  letterPackTrackingUrl,
  PREP_DOC_ALWAYS_EXTRAS,
  PREP_DOC_DEFS,
  PREP_DOC_STATUS_OPTIONS,
  prepDocLabel,
  prepStatusOption,
  type PrepChecklistMeta,
  type PrepDocSources,
} from "./application-prep";


function meta(over: Partial<PrepChecklistMeta>): PrepChecklistMeta {
  return { ...EMPTY_PREP_META, ...over };
}
function sources(over: Partial<PrepDocSources>): PrepDocSources {
  return { filledDocKeys: new Set(), photoPath: null, healthComplete: false, ...over };
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
    expect(isSatisfied(def("zairyu"), meta({}), sources({}))).toBe(false);
    expect(
      isSatisfied(def("zairyu"), meta({}), sources({ filledDocKeys: new Set(["cert_zairyu"]) })),
    ).toBe(true);
  });

  it("顔写真は photo_path があれば充足", () => {
    expect(isSatisfied(def("photo"), meta({}), sources({ photoPath: "p.jpg" }))).toBe(true);
  });

  it("源泉徴収票は対象年度の前年分（target-1）の gensen_r{年} があれば充足", () => {
    const m = meta({ target_reiwa: 7 }); // 令和7年度課税 → 令和6年分源泉
    expect(isSatisfied(def("gensen"), m, sources({ filledDocKeys: new Set(["gensen_r6"]) }))).toBe(true);
    expect(isSatisfied(def("gensen"), m, sources({ filledDocKeys: new Set(["gensen_r7"]) }))).toBe(false);
  });

  it("健康診断書は healthComplete で充足（詳細ページで判定）", () => {
    expect(isSatisfied(def("kenshin"), meta({}), sources({ healthComplete: false }))).toBe(false);
    expect(isSatisfied(def("kenshin"), meta({}), sources({ healthComplete: true }))).toBe(true);
  });
});

describe("evaluatePrepChecklist", () => {
  it("更新・国保&年金加入で必要書類と不足を集計する", () => {
    const m = meta({ app_type: "更新", has_kokuho: true, has_nenkin: true, target_reiwa: 7 });
    const { items, missing } = evaluatePrepChecklist(
      m,
      sources({ filledDocKeys: new Set(["cert_zairyu", "gensen_r6"]), photoPath: "p.jpg" }),
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
  it("課税証明書は対象年度そのまま", () => {
    expect(prepDocLabel(def("kazei"), 7, 8)).toBe("令和7年度 課税証明書");
  });
  it("源泉徴収票は対象年度の前年分（令和7年度課税→令和6年分源泉）", () => {
    expect(prepDocLabel(def("gensen"), 7, 8)).toBe("令和6年分 源泉徴収票");
  });
  it("国保税納税証明書は現時点の最新年度", () => {
    expect(prepDocLabel(def("nozei_kokuho"), 7, 8)).toBe("令和8年度 納税証明書（国保税）");
  });
  it("年つきでない書類はそのまま", () => {
    expect(prepDocLabel(def("zairyu"), 7, 8)).toBe("在留カード（両面・現住所がわかるもの）");
  });
});

describe("準備状況（ステータス）の定義", () => {
  it("選択肢が定義されている書類IDは PREP_DOC_DEFS に存在する", () => {
    const ids = new Set(PREP_DOC_DEFS.map((d) => d.id));
    for (const docId of Object.keys(PREP_DOC_STATUS_OPTIONS)) {
      expect(ids.has(docId), `${docId} が書類定義にない`).toBe(true);
    }
    for (const docId of Object.keys(PREP_DOC_ALWAYS_EXTRAS)) {
      expect(ids.has(docId), `${docId} が書類定義にない`).toBe(true);
    }
  });
  it("どの書類にも準備中と完了の選択肢がある", () => {
    for (const [docId, options] of Object.entries(PREP_DOC_STATUS_OPTIONS)) {
      expect(options.some((o) => !o.done), `${docId} に準備中がない`).toBe(true);
      expect(options.some((o) => o.done), `${docId} に完了がない`).toBe(true);
    }
  });
  it("prepStatusOption は選択中の選択肢を返す（未選択は null）", () => {
    expect(prepStatusOption("zairyu", "預かった")?.done).toBe(true);
    expect(prepStatusOption("zairyu", "")).toBeNull();
  });
});

describe("在留資格認定申請（認定）", () => {
  it("認定は変更と同じ書類＋推薦状が必要", () => {
    const ninteiIds = evaluatePrepChecklist(
      meta({ app_type: "認定", has_kokuho: true, has_nenkin: true, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    const henkouIds = evaluatePrepChecklist(
      meta({ app_type: "変更", has_kokuho: true, has_nenkin: true, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(ninteiIds).toEqual(henkouIds);
    expect(ninteiIds).toContain("suisenjo");
  });
  it("更新には推薦状は不要", () => {
    const ids = evaluatePrepChecklist(
      meta({ app_type: "更新", has_kokuho: true, has_nenkin: true, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(ids).not.toContain("suisenjo");
  });
});

describe("letterPackTrackingUrl", () => {
  it("追跡番号から記号を除いて日本郵便の追跡ページを組み立てる", () => {
    expect(letterPackTrackingUrl("1234-5678-9012")).toBe(
      "https://trackings.post.japanpost.jp/services/srv/search/direct?searchKind=S002&locale=ja&reqCodeNo1=123456789012",
    );
  });
});
