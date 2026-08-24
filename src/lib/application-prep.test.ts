import { describe, expect, it } from "vitest";
import {
  EMPTY_PREP_META,
  evaluatePrepChecklist,
  isDocComplete,
  isPrepPageKeyOf,
  isRequired,
  isSatisfied,
  letterPackTrackingUrl,
  parseAttachItems,
  PREP_DOC_ALWAYS_EXTRAS,
  PREP_DOC_ATTACH_ITEMS,
  PREP_DOC_DEFS,
  PREP_DOC_STATUS_OPTIONS,
  prepApplyDocKey,
  prepDocLabel,
  prepPageKey,
  prepProgressOf,
  prepStatusOption,
  serializeAttachItems,
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

  it("変更申請では健康診断書が必要、更新では不要", () => {
    expect(isRequired(def("kenshin"), meta({ app_type: "変更" }))).toBe(true);
    expect(isRequired(def("kenshin"), meta({ app_type: "更新" }))).toBe(false);
  });

  it("国保加入時のみ国保税納税証明書・保険証が必要", () => {
    expect(isRequired(def("nozei_kokuho"), meta({ app_type: "更新" }))).toBe(false);
    expect(isRequired(def("nozei_kokuho"), meta({ app_type: "更新", has_kokuho: true }))).toBe(true);
    expect(isRequired(def("hokensho"), meta({ app_type: "変更", has_kokuho: true }))).toBe(true);
  });

  it("保険証・資格確認証は国保加入なら更新でも必要（認定・特定活動は加入を問わず不要）", () => {
    expect(isRequired(def("hokensho"), meta({ app_type: "更新" }))).toBe(false);
    expect(isRequired(def("hokensho"), meta({ app_type: "更新", has_kokuho: true }))).toBe(true);
    expect(isRequired(def("hokensho"), meta({ app_type: "認定", has_kokuho: true }))).toBe(false);
    expect(isRequired(def("nozei_kokuho"), meta({ app_type: "認定", has_kokuho: true }))).toBe(false);
    expect(isRequired(def("nenkin"), meta({ app_type: "特定活動", has_nenkin: true }))).toBe(false);
  });

  it("認定・特定活動では源泉徴収票・課税/納税証明書（市県民税）は不要", () => {
    for (const id of ["gensen", "kazei", "nozei_shiken"] as const) {
      expect(isRequired(def(id), meta({ app_type: "認定" }))).toBe(false);
      expect(isRequired(def(id), meta({ app_type: "特定活動" }))).toBe(false);
      expect(isRequired(def(id), meta({ app_type: "更新" }))).toBe(true);
      expect(isRequired(def(id), meta({ app_type: "変更" }))).toBe(true);
    }
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

  it("健康診断書はファイル（kenshin）が添付されていれば充足（詳細確認はステータスで管理）", () => {
    expect(isSatisfied(def("kenshin"), meta({}), sources({}))).toBe(false);
    expect(
      isSatisfied(def("kenshin"), meta({}), sources({ filledDocKeys: new Set(["kenshin"]) })),
    ).toBe(true);
  });
});

describe("evaluatePrepChecklist", () => {
  it("更新・国保&年金加入で必要書類と不足を集計する（完了＝添付＋ステータス完了）", () => {
    const m = meta({ app_type: "更新", has_kokuho: true, has_nenkin: true, target_reiwa: 7 });
    const { items, missing } = evaluatePrepChecklist(
      m,
      sources({ filledDocKeys: new Set(["cert_zairyu", "gensen_r6"]), photoPath: "p.jpg" }),
      {
        zairyu: "預かった",
        photo: "顔写真加工なし確認済み",
        gensen: "本人から送られてきた",
      },
    );
    // 更新の必要書類: 在留カード/顔写真/パスポート/源泉/課税/納税(市県民)/納税(国保)/
    // 保険証・資格確認証/年金記録 = 9件
    expect(items).toHaveLength(9);
    // 完了: 在留カード・顔写真・源泉（添付あり＋完了ステータス） → 不足は 6件
    expect(missing.map((x) => x.def.id).sort()).toEqual(
      ["hokensho", "kazei", "nenkin", "nozei_kokuho", "nozei_shiken", "passport"].sort(),
    );
  });

  it("添付があってもステータスが完了でなければ不足のまま", () => {
    const m = meta({ app_type: "更新", has_kokuho: false, has_nenkin: false, target_reiwa: 7 });
    const { items } = evaluatePrepChecklist(
      m,
      sources({ filledDocKeys: new Set(["cert_zairyu"]) }),
      { zairyu: "写真だけ先に本人に依頼中" },
    );
    const zairyu = items.find((x) => x.def.id === "zairyu")!;
    expect(zairyu.fileSatisfied).toBe(true);
    expect(zairyu.satisfied).toBe(false);
  });
});

describe("isDocComplete", () => {
  it("完了ステータス＋添付ありで完了", () => {
    expect(isDocComplete("zairyu", true, "預かった")).toBe(true);
    expect(isDocComplete("zairyu", false, "預かった")).toBe(false);
    expect(isDocComplete("zairyu", true, "写真だけ先に本人に依頼中")).toBe(false);
  });
  it("発行できない系（noFile）の完了ステータスは添付なしでも完了", () => {
    expect(isDocComplete("nozei_shiken", false, "非課税のため発行できなかった")).toBe(true);
    expect(
      isDocComplete("kazei", false, "1月1日時点で日本に在住していなかった為発行できなかった"),
    ).toBe(true);
    // 推薦状: 特定活動からの資格変更（ベトナム）は発行なしで完了
    expect(
      isDocComplete("suisenjo", false, "特定活動からの資格変更の為、発行なし（国籍：ベトナム）"),
    ).toBe(true);
  });
  it("ステータス選択肢の無い書類（合格証）は添付のみで完了", () => {
    expect(isDocComplete("cert_senmonkyu", true, "")).toBe(true);
    expect(isDocComplete("cert_senmonkyu", false, "")).toBe(false);
  });
});

describe("特定活動へ資格変更申請", () => {
  it("必要書類は在留カード・顔写真・パスポート・合格証3種", () => {
    const ids = evaluatePrepChecklist(
      meta({ app_type: "特定活動", has_kokuho: true, has_nenkin: true, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(ids.sort()).toEqual(
      ["zairyu", "photo", "passport", "cert_senmonkyu", "cert_nihongo", "cert_senmongai"].sort(),
    );
  });
  it("変更申請には合格証3種も含まれる", () => {
    const ids = evaluatePrepChecklist(
      meta({ app_type: "変更", has_kokuho: false, has_nenkin: false, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(ids).toContain("cert_senmonkyu");
    expect(ids).toContain("cert_nihongo");
    expect(ids).toContain("cert_senmongai");
  });
});

describe("添付する資料項目（attach_items）", () => {
  it("年金記録には 年金記録／免除申請書 の選択肢がある", () => {
    expect(PREP_DOC_ATTACH_ITEMS.nenkin).toEqual(["年金記録", "免除申請書"]);
  });
  it("カンマ区切りで保存・復元できる", () => {
    expect(serializeAttachItems(["年金記録", "免除申請書"])).toBe("年金記録,免除申請書");
    expect(parseAttachItems("年金記録,免除申請書")).toEqual(["年金記録", "免除申請書"]);
    expect(parseAttachItems("")).toEqual([]);
  });
});

describe("複数添付のキー（prepPageKey / isPrepPageKeyOf）", () => {
  it("1枚目は基本キー、2枚目以降は _p{n} を付ける", () => {
    expect(prepPageKey("prep_kazei_r7", 1)).toBe("prep_kazei_r7");
    expect(prepPageKey("prep_kazei_r7", 2)).toBe("prep_kazei_r7_p2");
  });
  it("基本キーと枝番キーだけがその書類の添付と判定される", () => {
    expect(isPrepPageKeyOf("prep_kazei_r7", "prep_kazei_r7")).toBe(true);
    expect(isPrepPageKeyOf("prep_kazei_r7", "prep_kazei_r7_p2")).toBe(true);
    expect(isPrepPageKeyOf("prep_kazei_r7", "prep_kazei_r70")).toBe(false);
    expect(isPrepPageKeyOf("prep_kazei_r7", "prep_kazei_r7_px")).toBe(false);
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
  it("認定は推薦状が必要で、日本での課税・保険関係の書類は不要", () => {
    const ninteiIds = evaluatePrepChecklist(
      meta({ app_type: "認定", has_kokuho: true, has_nenkin: true, target_reiwa: 7 }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(ninteiIds).toContain("suisenjo");
    // 海外から呼ぶ申請のため、在留カード・日本での課税実績・保険加入の書類は出さない
    for (const id of [
      "zairyu",
      "gensen",
      "kazei",
      "nozei_shiken",
      "nozei_kokuho",
      "hokensho",
      "nenkin",
    ]) {
      expect(ninteiIds).not.toContain(id);
    }
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

describe("合格証の組み合わせ（cert_pattern）", () => {
  const ids = (pattern: PrepChecklistMeta["cert_pattern"]) =>
    evaluatePrepChecklist(
      meta({ app_type: "特定活動", cert_pattern: pattern }),
      sources({}),
    ).items
      .map((x) => x.def.id)
      .filter((id) => ["cert_senmonkyu", "cert_nihongo", "cert_senmongai", "hyoka_chosho"].includes(id))
      .sort();

  it("未選択のときは合格証3種を表示（調書は出さない）", () => {
    expect(ids("")).toEqual(["cert_nihongo", "cert_senmongai", "cert_senmonkyu"].sort());
  });
  it("専門級あり（同じ分野）→ 専門級のみ", () => {
    expect(ids("専門級")).toEqual(["cert_senmonkyu"]);
  });
  it("専門級以外の分野で就職（専門級あり）→ 専門外＋専門級", () => {
    expect(ids("別分野・専門級")).toEqual(["cert_senmongai", "cert_senmonkyu"].sort());
  });
  it("専門級なし → 専門外＋日本語（日本語は必須）", () => {
    expect(ids("専門外・日本語")).toEqual(["cert_nihongo", "cert_senmongai"].sort());
  });
  it("専門級なし・技能実習2号を良好修了 → 技能評価調書", () => {
    expect(ids("技能評価調書")).toEqual(["hyoka_chosho"]);
  });
  it("専門級以外の分野で就職（技能評価調書あり）→ 専門外＋技能評価調書", () => {
    expect(ids("専門外・技能評価調書")).toEqual(["cert_senmongai", "hyoka_chosho"].sort());
  });
  it("更新申請には合格証・調書は出ない", () => {
    const updateIds = evaluatePrepChecklist(
      meta({ app_type: "更新", cert_pattern: "専門級" }),
      sources({}),
    ).items.map((x) => x.def.id);
    expect(updateIds).not.toContain("cert_senmonkyu");
    expect(updateIds).not.toContain("hyoka_chosho");
  });
});

describe("prepProgressOf", () => {
  // 申請準備のTODO一覧に出す「書類 ○%（○/○件）」の計算
  const items = (n: number, doneCount: number) =>
    Array.from({ length: n }, (_, i) => ({
      def: PREP_DOC_DEFS[i],
      required: true,
      satisfied: i < doneCount,
      fileSatisfied: i < doneCount,
    }));

  it("必要書類が0件（申請種別未選択）のときは0%", () => {
    expect(prepProgressOf([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("何件中何件そろったかと％を返す", () => {
    expect(prepProgressOf(items(4, 1))).toEqual({ done: 1, total: 4, percent: 25 });
    expect(prepProgressOf(items(3, 3))).toEqual({ done: 3, total: 3, percent: 100 });
  });

  it("割り切れないときは四捨五入する", () => {
    expect(prepProgressOf(items(3, 1)).percent).toBe(33);
    expect(prepProgressOf(items(3, 2)).percent).toBe(67);
  });

  it("チェックリストの判定（evaluatePrepChecklist）とつないで計算できる", () => {
    const { items: evaluated } = evaluatePrepChecklist(
      meta({ app_type: "更新", target_reiwa: 7 }),
      sources({}),
    );
    expect(prepProgressOf(evaluated)).toEqual({
      done: 0,
      total: evaluated.length,
      percent: 0,
    });
  });
});

describe("prepApplyDocKey", () => {
  // 申請する書類（最後に添付する完成した書類）の保存キー
  it("TODO番号ごとに別のキーになる", () => {
    expect(prepApplyDocKey("TODO-1306")).toBe("prep_shinsei_1306");
    expect(prepApplyDocKey("1306")).toBe("prep_shinsei_1306");
    expect(prepApplyDocKey("todo 1306")).toBe("prep_shinsei_1306");
  });

  it("番号未設定のときは基本キー", () => {
    expect(prepApplyDocKey("")).toBe("prep_shinsei");
  });

  it("保存キーの制限（英数字と_のみ・32文字まで）に収まる", () => {
    for (const no of ["TODO-1306", "", "TODO-999999999999999999"]) {
      const key = prepApplyDocKey(no);
      expect(key).toMatch(/^[a-z0-9_]{1,32}$/);
      // 2枚目以降の枝番を足しても収まる
      expect(prepPageKey(key, 99)).toMatch(/^[a-z0-9_]{1,32}$/);
    }
  });

  it("枝番キーは同じ書類として扱われる", () => {
    const key = prepApplyDocKey("TODO-1306");
    expect(isPrepPageKeyOf(key, prepPageKey(key, 2))).toBe(true);
    expect(isPrepPageKeyOf(key, prepApplyDocKey("TODO-1307"))).toBe(false);
  });
});
