import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  REF_FORM_ITEMS,
  REF_FORM_SAMPLE_DATA,
  fillRefForm,
  fillRefFormsMerged,
  languageForNationality,
  mergeRefForms,
  normalizeRefFormLayout,
  normalizeSignPages,
  parseRefFormMode,
  pickRefFormTemplate,
  refFormFileName,
  refFormName,
  refFormPagesFor,
  withDerivedPlanDates,
  refFormValue,
  refFormCircleShown,
  refFormStrikeLength,
  refFormLineSkip,
  parseReferralFeePresets,
  refFormStrikeThickness,
  refFormCircles,
  refFormOffIds,
  applyRefFormEdits,
  normalizeRefFormEdits,
  refFormInitialText,
  refFormSampleOf,
  refFormWage6Values,
  refFormCellWidth,
  isRefFormKey,
  refFormFitLines,
  isOrgSpecificRefForm,
  refFormPrepCell,
  refFormPrepKeys,
  isCustomRefFormKey,
  isJapaneseOnlyRefForm,
  normalizeCustomRefForms,
} from "./ref-form";

describe("参考様式の行", () => {
  it("提出書類一覧表のうち参考様式の書類だけ", () => {
    const keys = REF_FORM_ITEMS.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["t1-4-1", "t1-5", "t1-6-1", "t1-6-2", "t1-7-1", "t1-8-2", "t1-17", "t1-18", "t1-19", "t3a-2", "t3a-4"]));
    expect(keys).not.toContain("t1-9"); // 市区町村が発行する書類
    // 外国人から集める書類（必要な書類で揃える）は参考様式でもひな形を使わない
    expect(keys).not.toContain("t3a-1-1"); // 評価調書・専門級の合格証
    // 健康診断個人票（1-3号）は集める書類でも、本人の言語の様式を用意するのでひな形を使う
    expect(keys).toContain("t1-8-1");
    expect(keys).toContain("s2-9-1");
    expect(refFormName("t1-4-1")).toBe("参考様式第1-4号");
    expect(refFormName("t3a-1-1")).toBe("参考様式第1-2号");
  });
});

describe("言語の版を選ぶ", () => {
  const ts = [
    { id: "a", form_key: "t1-5", language: "日本語" },
    { id: "b", form_key: "t1-5", language: "ベトナム語" },
    { id: "c", form_key: "t1-6-1", language: "クメール語" },
  ];
  it("国籍の言語 → 日本語（ほかの国の言語の版は使わない）", () => {
    expect(languageForNationality("ベトナム")).toBe("ベトナム語");
    expect(languageForNationality("カンボジア")).toBe("クメール語");
    expect(pickRefFormTemplate(ts, "t1-5", "ベトナム")?.id).toBe("b");
    expect(pickRefFormTemplate(ts, "t1-5", "インドネシア")?.id).toBe("a");
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム")).toBeNull();
    expect(pickRefFormTemplate(ts, "t1-6-1", "カンボジア")?.id).toBe("c");
    expect(pickRefFormTemplate(ts, "t1-17", "ベトナム")).toBeNull();
    // 言語を選び直したとき
    expect(pickRefFormTemplate(ts, "t1-5", "ベトナム", null, "日本語")?.id).toBe("a");
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム", null, "クメール語")?.id).toBe("c");
  });
});

describe("所属機関別のひな形（雇用条件書など）", () => {
  const ts = [
    { id: "common-ja", form_key: "t1-6-1", language: "日本語", organization_id: null },
    { id: "common-vi", form_key: "t1-6-1", language: "ベトナム語", organization_id: null },
    { id: "orgA-ja", form_key: "t1-6-1", language: "日本語", organization_id: "A" },
    { id: "orgB-vi", form_key: "t1-6-1", language: "ベトナム語", organization_id: "B" },
  ];
  it("その所属機関の版（国籍の言語 → 日本語）を先に使う", () => {
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム", "A")?.id).toBe("orgA-ja");
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム", "B")?.id).toBe("orgB-vi");
  });
  it("その所属機関の版が無ければ全員共通の版。ほかの所属機関の版は使わない", () => {
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム", "C")?.id).toBe("common-vi");
    expect(pickRefFormTemplate(ts, "t1-6-1", "インドネシア", null)?.id).toBe("common-ja");
    expect(pickRefFormTemplate([ts[3]], "t1-6-1", "ベトナム", "A")).toBeNull();
  });
});

describe("書き込む値", () => {
  const d = { ...REF_FORM_SAMPLE_DATA, today: "2026-11-16" };
  it("本人・所属機関・登録支援機関・日付", () => {
    expect(refFormValue({ kind: "name" }, d)).toBe("NGUYEN VAN A");
    expect(refFormValue({ kind: "birth_seireki" }, d)).toBe("1995年3月8日");
    expect(refFormValue({ kind: "birth_y" }, d)).toBe("1995");
    expect(refFormValue({ kind: "postal" }, d)).toBe("〒866-0021");
    expect(refFormValue({ kind: "org_name" }, d)).toBe("株式会社サンプル農園");
    expect(refFormValue({ kind: "so_reg_no" }, d)).toBe("20登-005746");
    // 「書類作成日（支援計画書）」のまとまり: 保存した書類作成日、無ければ作った日（今日）
    expect(refFormValue({ kind: "today" }, { ...d, planDates: { doc: "2026-11-14" } })).toBe("令和8年11月14日");
    expect(refFormValue({ kind: "today_d" }, { ...d, planDates: { doc: "2026-11-14" } })).toBe("14");
    expect(refFormValue({ kind: "today" }, { ...d, planDates: {} })).toBe("令和8年11月16日");
    expect(refFormValue({ kind: "today_seireki" }, { ...d, planDates: {} })).toBe("2026年11月16日");
    expect(refFormValue({ kind: "text", text: "同意します" }, d)).toBe("同意します");
  });

  it("年齢は書類作成日（無ければ作った日）の時点の満年齢（誕生日の前日までは1つ少ない）", () => {
    const n = { ...d, planDates: {} }; // 書類作成日なし → 作った日（2026-11-16）
    expect(refFormValue({ kind: "age" }, n)).toBe("31");
    const p = { ...d.person, birth: "1995-11-17" };
    expect(refFormValue({ kind: "age" }, { ...n, person: p })).toBe("30");
    expect(refFormValue({ kind: "age" }, { ...n, person: { ...p, birth: "1995-11-16" } })).toBe("31");
    expect(refFormValue({ kind: "age" }, { ...n, person: { ...p, birth: null } })).toBe("");
    // 書類作成日（2026-11-14）の時点では、11月16日生まれはまだ誕生日前
    expect(refFormValue({ kind: "age" }, { ...n, planDates: { doc: "2026-11-14" }, person: { ...p, birth: "1995-11-16" } })).toBe("30");
  });

  it("性別で出し分ける○は、本人の性別の方だけ書き込む", () => {
    expect(refFormCircleShown("circle_male", "男")).toBe(true);
    expect(refFormCircleShown("circle_female", "男")).toBe(false);
    expect(refFormCircleShown("circle_male", "女")).toBe(false);
    expect(refFormCircleShown("circle_female", "女性")).toBe(true);
    expect(refFormCircleShown("circle_female", "F")).toBe(true);
    // 性別が分からないときはどちらも書かない。ふつうの○はいつも書く
    expect(refFormCircleShown("circle_male", "")).toBe(false);
    expect(refFormCircleShown("circle_female", "")).toBe(false);
    expect(refFormCircleShown("circle", "")).toBe(true);
  });

  it("自由な文字は、入れていない（空・見本の「（文字）」のまま）なら何も書かない", () => {
    expect(refFormValue({ kind: "text", text: "" }, d)).toBe("");
    expect(refFormValue({ kind: "text" }, d)).toBe("");
    expect(refFormValue({ kind: "text", text: "（文字）" }, d)).toBe("");
    expect(refFormValue({ kind: "text", text: "農業" }, d)).toBe("農業");
  });

  it("作るときに外せる○の一覧と、外す指定（off）の読み取り", () => {
    const layout = normalizeRefFormLayout([
      { id: "a", kind: "circle", page: 0, x: 50, y: 100, size: 16 },
      { id: "b", kind: "circle_male", page: 0, x: 10, y: 100, size: 16, text: "③性別の男" },
      { id: "c", kind: "name", page: 0, x: 0, y: 0, size: 10 },
      { id: "d", kind: "circle", page: 1, x: 0, y: 0, size: 16 },
    ]);
    expect(refFormCircles(layout)).toEqual([
      { id: "b", label: "③性別の男（男のときだけ）" },
      { id: "a", label: "1ページ目の○（2個目）" },
      { id: "d", label: "2ページ目の○（1個目）" },
    ]);
    expect([...refFormOffIds("t1:a,t2:b,t1:d,bad,t1:", "t1")]).toEqual(["a", "d"]);
    expect(refFormOffIds(null, "t1").size).toBe(0);
  });

  it("書類作成日（支援計画書の日付）を年・月・日でも書ける。無ければ空欄", () => {
    const x = { ...d, docDate: "2026-11-14" };
    expect(refFormValue({ kind: "doc_date" }, x)).toBe("令和8年11月14日");
    expect(refFormValue({ kind: "doc_date_seireki" }, x)).toBe("2026年11月14日");
    expect(refFormValue({ kind: "doc_y" }, x)).toBe("2026");
    expect(refFormValue({ kind: "doc_m" }, x)).toBe("11");
    expect(refFormValue({ kind: "doc_d" }, x)).toBe("14");
    for (const kind of ["doc_date", "doc_date_seireki", "doc_y", "doc_m", "doc_d"] as const) {
      expect(refFormValue({ kind }, { ...d, docDate: "" })).toBe("");
    }
  });

  it("保存値の読み込み", () => {
    expect(normalizeRefFormLayout([{ kind: "name", page: 1, x: 10, y: 20, size: 11 }, { kind: "nope" }, null])).toHaveLength(1);
    expect(normalizeSignPages([2, 0, 2, -1, 1.5, "x"])).toEqual([0, 2]);
    expect(parseRefFormMode("sign")).toBe("sign");
    expect(parseRefFormMode("x")).toBe("one");
  });
});

describe("PDFを作る", () => {
  it("書き込み・一気に（全ページ）・署名ページだけ", async () => {
    const make = async (n: number) => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < n; i++) doc.addPage([595, 842]);
      return doc.save();
    };
    const font = readFileSync(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const layout = normalizeRefFormLayout([
      { kind: "name", page: 0, x: 50, y: 50, size: 12 },
      { kind: "org_name", page: 2, x: 50, y: 80, size: 10 },
      { kind: "check", page: 1, x: 30, y: 30, size: 10 },
      { kind: "strike", page: 1, x: 30, y: 60, size: 10, maxWidth: 80 },
    ]);
    const data = { ...REF_FORM_SAMPLE_DATA, today: "2026-11-16" };
    const a = await fillRefForm(await make(3), font, layout, data);
    const b = await fillRefForm(await make(2), font, [], data);
    const all = await PDFDocument.load(await mergeRefForms([{ doc: a }, { doc: b }]));
    expect(all.getPageCount()).toBe(5);
    const sign = await PDFDocument.load(
      await mergeRefForms([
        { doc: a, onlyPages: refFormPagesFor("sign", [2]) },
        { doc: b, onlyPages: refFormPagesFor("sign", [0, 1]) },
      ]),
    );
    expect(sign.getPageCount()).toBe(3);
    expect(refFormPagesFor("all", [1])).toBeUndefined();
  }, 20000);

  it("訂正線（横線）の長さ・太さ", () => {
    const [strike] = normalizeRefFormLayout([{ kind: "strike", page: 0, x: 10, y: 20, size: 10, maxWidth: 80 }]);
    expect(strike.kind).toBe("strike");
    expect(refFormStrikeLength(strike)).toBe(80);
    expect(refFormStrikeLength({ maxWidth: undefined })).toBe(40);
    expect(refFormStrikeThickness({ size: 10 })).toBe(1);
    expect(refFormStrikeThickness({ size: 4 })).toBe(0.5);
    expect(refFormValue(strike, REF_FORM_SAMPLE_DATA)).toBe("");
  });

  it("1行で収まるとき下の行に寄せる", () => {
    const [it2] = normalizeRefFormLayout([{ kind: "name", page: 0, x: 0, y: 0, size: 10, maxWidth: 100, maxLines: 2, valign: "bottom" }]);
    expect(it2.valign).toBe("bottom");
    expect(refFormLineSkip(it2, 1)).toBe(1);
    expect(refFormLineSkip(it2, 2)).toBe(0);
    expect(refFormLineSkip({ maxLines: 2 }, 1)).toBe(0);
    expect(normalizeRefFormLayout([{ kind: "name", page: 0, x: 0, y: 0, size: 10, valign: "x" }])[0].valign).toBeUndefined();
  });

  it("最大の幅に入らなくても文字を小さくしない", () => {
    const measure = (t: string, sz: number) => t.length * sz;
    expect(refFormFitLines("あいうえお", { size: 10, maxWidth: 20 }, measure).size).toBeLessThan(10);
    expect(refFormFitLines("あいうえお", { size: 10, maxWidth: 20, noShrink: true }, measure)).toEqual({ size: 10, lines: ["あいうえお"] });
    expect(normalizeRefFormLayout([{ kind: "text", page: 0, x: 0, y: 0, size: 10, noShrink: true }])[0].noShrink).toBe(true);
  });

  it("紹介手数料（1-16号）", () => {
    expect(parseReferralFeePresets("300000、250,000　300000\n１５００００円")).toEqual([300000, 250000, 150000]);
    expect(parseReferralFeePresets("")).toEqual([]);
    expect(parseReferralFeePresets("300000,250000")).toEqual([300000, 250000]);
    const item = { kind: "referral_fee" as const };
    expect(refFormValue(item, { ...REF_FORM_SAMPLE_DATA, referralFee: "300000" })).toBe("300,000");
    expect(refFormValue(item, { ...REF_FORM_SAMPLE_DATA, referralFee: "" })).toBe("");
  });

  it("ファイル名", () => {
    expect(refFormFileName("all", "NGUYEN VAN A")).toBe("NGUYEN VAN A_参考様式一式.pdf");
    expect(refFormFileName("sign", "A/B")).toBe("AB_署名ページ.pdf");
    expect(refFormFileName("one", "A", "t1-5")).toBe("A_参考様式第1-5号.pdf");
  });
});

describe("所属機関ごとに用意する参考様式", () => {
  it("1-4号・1-5号・1-6号・1-6号別紙（2号の同じ様式も）", () => {
    expect(isOrgSpecificRefForm("t1-5")).toBe(true);
    expect(isOrgSpecificRefForm("s2-6-2")).toBe(true);
    expect(isOrgSpecificRefForm("t1-18")).toBe(true); // 1-17号
    expect(isOrgSpecificRefForm("s2a-2")).toBe(true); // 11-1号（2号）
    expect(isOrgSpecificRefForm("t1-19")).toBe(false);
    expect(refFormPrepKeys()).toEqual(expect.arrayContaining(["t1-4-1", "t1-18", "guidance", "orientation"]));
    expect(refFormPrepKeys()).not.toContain("s2-5"); // 1号のキーにまとめる
  });
  it("様式 × 言語の状況", () => {
    const ts = [
      { form_key: "t1-5", language: "日本語", organization_id: null, layout: [{}] },
      { form_key: "t1-5", language: "クメール語", organization_id: "A", layout: [] },
      { form_key: "t1-18", language: "日本語", organization_id: null, layout: [{}] },
    ];
    // 所属機関別: その所属機関の版を見る
    expect(refFormPrepCell(ts, "t1-5", "クメール語", "A").status).toBe("nolayout");
    const m = refFormPrepCell(ts, "t1-5", "日本語", "A");
    expect(m.status).toBe("missing");
    expect(m.used?.organization_id).toBeNull(); // 今は全員共通の日本語の版を使う
    expect(refFormPrepCell(ts, "t1-5", "クメール語", "B").used?.language).toBe("日本語"); // ほかの所属機関の版は使わない
    expect(refFormPrepCell([ts[1]], "t1-5", "クメール語", "B").used).toBeNull();
    // 全員共通
    expect(refFormPrepCell(ts, "t1-18", "日本語", "A").status).toBe("missing"); // 1-17号は所属機関別
    expect(refFormPrepCell(ts, "t1-18", "日本語", "A").used?.organization_id).toBeNull();
  });
});

describe("日本語の版だけの様式", () => {
  it("日本語の版だけなら、ほかの言語の版は要らない", () => {
    const ts = [
      { form_key: "t3a-2", language: "日本語", organization_id: "A" },
      { form_key: "t1-7-1", language: "日本語", organization_id: null },
      { form_key: "t1-7-1", language: "ベトナム語", organization_id: null },
      { form_key: "t1-5", language: "クメール語", organization_id: "B" },
    ];
    expect(isJapaneseOnlyRefForm(ts, "t3a-2", "A")).toBe(true);
    expect(isJapaneseOnlyRefForm(ts, "t1-7-1", "A")).toBe(false); // ベトナム語の版もある
    expect(isJapaneseOnlyRefForm(ts, "t1-5", "A")).toBe(false); // 登録なし（ほかの所属機関の版は見ない）
    expect(isJapaneseOnlyRefForm(ts, "t3a-2", "B")).toBe(false);
  });
});

describe("追加した参考様式", () => {
  it("キーと保存値", () => {
    expect(isCustomRefFormKey("custom-ab12cd34")).toBe(true);
    expect(isCustomRefFormKey("custom-../x")).toBe(false);
    expect(isRefFormKey("custom-ab12cd34")).toBe(true);
    const forms = normalizeCustomRefForms({
      forms: [
        { key: "custom-ab12cd34", name: " 参考様式第1-10号 ", label: "技能移転", orgSpecific: true },
        { key: "custom-ab12cd34", name: "重複" },
        { key: "bad", name: "x" },
      ],
    });
    expect(forms).toEqual([{ key: "custom-ab12cd34", name: "参考様式第1-10号", label: "技能移転", orgSpecific: true, created_at: "" }]);
    expect(normalizeCustomRefForms(null)).toEqual([]);
  });
});

describe("アプリに入れてある入管の参考様式", () => {
  it("どれも参考様式の行で、ファイルがある", async () => {
    const { existsSync } = await import("node:fs");
    const { BUNDLED_REF_FORMS } = await import("./ref-form");
    for (const [key, file] of Object.entries(BUNDLED_REF_FORMS)) {
      expect(REF_FORM_ITEMS.some((i) => i.key === key)).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public", "forms", "ref-forms", file))).toBe(true);
    }
  });

  it("全員共通・日本語のひな形がまだ無いものだけ", async () => {
    const { missingBundledRefForms } = await import("./ref-form");
    const all = missingBundledRefForms([]);
    expect(all).toEqual(expect.arrayContaining(["t1-4-1", "t1-17", "s2-8", "t3a-2", "t3a-4"]));
    const rest = missingBundledRefForms([
      { form_key: "t1-4-1", language: "日本語", organization_id: null },
      { form_key: "t1-17", language: "日本語", organization_id: "org-A" }, // 所属機関別は数えない
      { form_key: "s2-8", language: "ベトナム語", organization_id: null }, // 日本語以外は数えない
    ]);
    expect(rest).not.toContain("t1-4-1");
    expect(rest).toContain("t1-17");
    expect(rest).toContain("s2-8");
  });
});

describe("作成画面で直した分（0230）", () => {
  const layout = normalizeRefFormLayout([
    { id: "t1", kind: "text", page: 0, x: 10, y: 10, size: 10, text: "（文字）" },
    { id: "t2", kind: "text", page: 0, x: 10, y: 30, size: 10, text: "代表取締役" },
    { id: "c1", kind: "circle", page: 0, x: 50, y: 50, size: 16 },
    { id: "n", kind: "name", page: 0, x: 0, y: 0, size: 10 },
  ]);

  it("文字の最初の値は 一時保存 → 所属機関の共通 → 記入位置の文字（見本の「（文字）」は空）", () => {
    expect(refFormInitialText(layout[0], {}, {})).toBe("");
    expect(refFormInitialText(layout[1], {}, {})).toBe("代表取締役");
    expect(refFormInitialText(layout[1], {}, { t2: "社長" })).toBe("社長");
    expect(refFormInitialText(layout[1], { t2: "" }, { t2: "社長" })).toBe("");
  });

  it("直した分を重ねる: 文字・動かした位置・外した項目", () => {
    const out = applyRefFormEdits(layout, { texts: { t1: "農作業" }, moves: { c1: { x: 80, y: 52 } }, off: ["t2"] }, { t2: "社長" });
    expect(out.map((i) => i.id)).toEqual(["t1", "c1", "n"]);
    expect(out[0].text).toBe("農作業");
    expect(out[1]).toMatchObject({ x: 80, y: 52 });
    expect(out[2]).toMatchObject({ x: 0, y: 0 });
  });

  it("保存値の読み込みは形の違うものを捨てる", () => {
    expect(
      normalizeRefFormEdits({ texts: { a: "x", b: 1 }, moves: { c: { x: 1, y: 2 }, d: { x: "1" } }, off: ["c", "c", 3] }),
    ).toEqual({ texts: { a: "x" }, moves: { c: { x: 1, y: 2 } }, off: ["c"], sizes: {} });
    expect(normalizeRefFormEdits(null)).toEqual({ texts: {}, moves: {}, off: [], sizes: {} });
  });
});

describe("支援計画書の日付（置いたあとに書き方を選ぶ）", () => {
  const d = { ...REF_FORM_SAMPLE_DATA, planDates: { cond: "2026-11-10", es: "2026-12-01" } };
  it("書き方どおりに書く。無ければ西暦", () => {
    expect(refFormValue({ kind: "plan_cond" }, d)).toBe("2026年11月10日");
    expect(refFormValue({ kind: "plan_cond", fmt: "wareki" }, d)).toBe("令和8年11月10日");
    expect(refFormValue({ kind: "plan_es", fmt: "y" }, d)).toBe("2026");
    expect(refFormValue({ kind: "plan_es", fmt: "m" }, d)).toBe("12");
    expect(refFormValue({ kind: "plan_es", fmt: "d" }, d)).toBe("1");
  });
  it("保存していない日付は空欄", () => {
    expect(refFormValue({ kind: "plan_guid", fmt: "y" }, d)).toBe("");
  });
  it("書き方は保存値から読み、見本も書き方に合わせる", () => {
    const [it0] = normalizeRefFormLayout([{ id: "a", kind: "plan_con", page: 0, x: 1, y: 2, size: 10, fmt: "m" }]);
    expect(it0.fmt).toBe("m");
    expect(normalizeRefFormLayout([{ id: "b", kind: "plan_con", page: 0, x: 1, y: 2, size: 10, fmt: "zzz" }])[0].fmt).toBeUndefined();
    expect(refFormSampleOf({ kind: "plan_con", fmt: "m" })).toBe("11");
    expect(refFormSampleOf({ kind: "name" })).toBe("NGUYEN VAN A");
  });
});

describe("賃金（月給・日給・時給）", () => {
  const d = { ...REF_FORM_SAMPLE_DATA, wage: { kind: "月給", amount: 220000 } };
  it("金額は3桁ごとにカンマ。種類が違う欄は空欄", () => {
    expect(refFormValue({ kind: "wage_amount" }, d)).toBe("220,000");
    expect(refFormValue({ kind: "wage_monthly" }, d)).toBe("220,000");
    expect(refFormValue({ kind: "wage_daily" }, d)).toBe("");
    expect(refFormValue({ kind: "wage_hourly" }, { ...d, wage: { kind: "時給", amount: 1100 } })).toBe("1,100");
    expect(refFormValue({ kind: "wage_amount" }, { ...d, wage: null })).toBe("");
  });
});

describe("1-6号別紙（賃金の支払）の値", () => {
  it("月給: 1時間当たり・合計・手当・手取りを、画面と同じ計算で出す", () => {
    const v = refFormWage6Values(
      { kind: "月給", amount: 191000 },
      { allowances: [{ type: "通勤手当", name: "", amount: 5000, method: "実費" }], social_enabled: false, employment_enabled: false },
      2088,
    );
    expect(v.hourly).toBe("1,098");
    expect(v.monthly).toBe("");
    expect(v.allow1_name).toBe("通勤手当");
    expect(v.allow1_amount).toBe("5,000");
    expect(v.allow1_method).toBe("実費");
    expect(v.allow_total).toBe("5,000");
    expect(v.gross).toBe("196,000");
    expect(v.allow2_name).toBeUndefined();
  });
  it("時給: 1か月当たりの金額を出し、1時間当たりは空欄", () => {
    const v = refFormWage6Values({ kind: "時給", amount: 1100 }, {}, 2088);
    expect(v.monthly).toBe("191,400");
    expect(v.hourly).toBe("");
  });
  it("固定残業代: 手当の名前・金額・時間数・超える時間数（入れていなければ時間数と同じ）", () => {
    const v = refFormWage6Values(
      { kind: "月給", amount: 191000 },
      { fixed_ot_enabled: true, fixed_ot_amount: 20000, fixed_ot_hours: 15, fixed_ot_name: "固定残業" },
      2088,
    );
    expect([v.ot_name, v.ot_amount, v.ot_hours, v.ot_over_hours]).toEqual(["固定残業", "20,000", "15", "15"]);
    const w = refFormWage6Values({ kind: "月給", amount: 191000 }, { fixed_ot_enabled: true, fixed_ot_hours: 15, fixed_ot_over_hours: 20 }, 2088);
    expect(w.ot_over_hours).toBe("20");
    const none = refFormWage6Values({ kind: "月給", amount: 191000 }, { fixed_ot_enabled: false, fixed_ot_name: "固定残業" }, 2088);
    expect(none.ot_name).toBe("");
  });
  it("置いた項目に値が入る", () => {
    const d = { ...REF_FORM_SAMPLE_DATA, wage6: { net: "144,712" } };
    expect(refFormValue({ kind: "w6_net" }, d)).toBe("144,712");
    expect(refFormValue({ kind: "w6_tax" }, d)).toBe("");
  });
});

describe("1-17号 支援計画書に記載する項目", () => {
  it("値が入る。無ければ空欄", () => {
    const d = { ...REF_FORM_SAMPLE_DATA, p117: { managers: "VUONG VAN THANH", check_B: "✓" } };
    expect(refFormValue({ kind: "p117_managers" }, d)).toBe("VUONG VAN THANH");
    expect(refFormValue({ kind: "p117_check_B" }, d)).toBe("✓");
    expect(refFormValue({ kind: "p117_check_A" }, d)).toBe("");
  });
});

describe("書類作成日（全様式共通）の年・月・日", () => {
  it("年・月・日を別々に書く。無ければ空欄", () => {
    const d = { ...REF_FORM_SAMPLE_DATA, planDates: { docAll: "2026-11-05" } };
    expect(refFormValue({ kind: "docall_y" }, d)).toBe("2026");
    expect(refFormValue({ kind: "docall_m" }, d)).toBe("11");
    expect(refFormValue({ kind: "docall_d" }, d)).toBe("5");
    expect(refFormValue({ kind: "docall_d" }, { ...d, planDates: {} })).toBe("");
  });
});

describe("証明書類の請求（税務署の交付請求書）", () => {
  const d = { ...REF_FORM_SAMPLE_DATA, myNumber: "1234-5678-9012", taxOfficeName: "八代税務署", agent: { name: "野口明菜", address: "熊本市" } };
  it("個人番号は12桁のときだけ数字で。税務署名・代理人", () => {
    expect(refFormValue({ kind: "my_number" }, d)).toBe("123456789012");
    expect(refFormValue({ kind: "my_number" }, { ...d, myNumber: "1234" })).toBe("");
    expect(refFormValue({ kind: "tax_office" }, d)).toBe("八代");
    expect(refFormValue({ kind: "tax_office_full" }, d)).toBe("八代税務署");
    expect(refFormValue({ kind: "agent_name" }, d)).toBe("野口明菜");
    expect(refFormValue({ kind: "agent_address" }, d)).toBe("熊本市");
  });
  it("マスの幅は入れた値、無ければ文字の大きさの1.5倍。保存値から読む", () => {
    expect(refFormCellWidth({ size: 10 })).toBe(15);
    expect(refFormCellWidth({ size: 10, cell: 18.1 })).toBe(18.1);
    expect(normalizeRefFormLayout([{ id: "a", kind: "my_number", page: 0, x: 1, y: 1, size: 10, cell: 18 }])[0].cell).toBe(18);
  });
  it("交付請求書（nozei3）もひな形を登録できる様式", () => {
    expect(isRefFormKey("nozei3")).toBe(true);
    expect(isRefFormKey("t1-4-1")).toBe(true);
    expect(isRefFormKey("nope")).toBe(false);
  });
});

describe("最大の幅と行数（折り返し）", () => {
  const m = (t: string, size: number) => t.length * size;
  it("1行のときは、入らなければ小さくする", () => {
    const r = refFormFitLines("あいうえおかきくけこ", { size: 10, maxWidth: 50 }, m);
    expect(r.lines).toEqual(["あいうえおかきくけこ"]);
    expect(r.size).toBe(5);
  });
  it("2行まで折り返す。2行に入るなら大きさはそのまま", () => {
    const r = refFormFitLines("あいうえおかきくけこ", { size: 10, maxWidth: 50, maxLines: 2 }, m);
    expect(r).toEqual({ size: 10, lines: ["あいうえお", "かきくけこ"] });
  });
  it("2行でも入らなければ小さくしてから折り返す", () => {
    const r = refFormFitLines("あいうえおかきくけこさしすせそ", { size: 10, maxWidth: 50, maxLines: 2 }, m);
    expect(r.lines.length).toBe(2);
    expect(r.size).toBeLessThan(10);
  });
  it("最大の幅が無ければ1行のまま", () => {
    expect(refFormFitLines("あいう", { size: 10, maxLines: 2 }, m)).toEqual({ size: 10, lines: ["あいう"] });
  });
  it("行数は保存値から読む（2〜5）", () => {
    const [a] = normalizeRefFormLayout([{ id: "a", kind: "agent_address", page: 0, x: 1, y: 1, size: 10, maxWidth: 160, maxLines: 2 }]);
    expect(a.maxLines).toBe(2);
    expect(normalizeRefFormLayout([{ id: "b", kind: "address", page: 0, x: 1, y: 1, size: 10, maxLines: 1 }])[0].maxLines).toBeUndefined();
  });
});

describe("本人に署名してもらうだけの書類（事前ガイダンス・生活オリエンテーション）", () => {
  it("ひな形を登録できる様式", () => {
    expect(isRefFormKey("guidance")).toBe(true);
    expect(isRefFormKey("orientation")).toBe(true);
  });
  it("署名ページだけ: 印が無ければ全部のページ。ほかの様式は印のページだけ（無ければ入れない）", () => {
    expect(refFormPagesFor("sign", [], "guidance")).toBeUndefined();
    expect(refFormPagesFor("sign", [1], "guidance")).toEqual([1]);
    expect(refFormPagesFor("sign", [], "t1-4-1")).toEqual([]);
    expect(refFormPagesFor("all", [0], "t1-4-1")).toBeUndefined();
  });
});

describe("所属機関の支援委託料", () => {
  it("3桁ごとにカンマ。未登録は空欄", () => {
    const d = { ...REF_FORM_SAMPLE_DATA, org: { ...REF_FORM_SAMPLE_DATA.org, supportFee: "２２０００円" } };
    expect(refFormValue({ kind: "org_support_fee" }, d)).toBe("22,000");
    expect(refFormValue({ kind: "org_support_fee" }, { ...d, org: { ...d.org, supportFee: "" } })).toBe("");
  });
});

describe("1-25号の契約期間（支援委託契約日から5年間）", () => {
  it("支援委託契約日から始めと終わり（5年後の前日）を出す", () => {
    const pd = withDerivedPlanDates({ con: "2026-11-12" });
    expect(pd.scFrom).toBe("2026-11-12");
    expect(pd.scTo).toBe("2031-11-11");
    expect(withDerivedPlanDates({}).scFrom).toBeUndefined();
  });
  it("始め・終わりは書き方を選べる。期間は1つの文でも書ける", () => {
    const d = { ...REF_FORM_SAMPLE_DATA, planDates: withDerivedPlanDates({ con: "2026-11-12" }) };
    expect(refFormValue({ kind: "plan_scTo", fmt: "y" }, d)).toBe("2031");
    expect(refFormValue({ kind: "plan_scFrom", fmt: "d" }, d)).toBe("12");
    expect(refFormValue({ kind: "sc_period" }, d)).toBe("2026年11月12日から2031年11月11日まで");
    expect(refFormValue({ kind: "sc_period" }, { ...d, planDates: {} })).toBe("");
  });
});

describe("1-6号別紙の0円の欄", () => {
  it("0円は書かない（空欄）", () => {
    const v = refFormWage6Values({ kind: "月給", amount: 191000 }, {}, 2088);
    expect(v.food).toBe("");
    expect(v.utility).toBe("");
    expect(v.gross).not.toBe("");
  });
});

describe("書類作成日（支援計画書）の年・月・日", () => {
  it("別々に置ける", () => {
    const data = { ...REF_FORM_SAMPLE_DATA, planDates: { doc: "2026-11-14", docAll: "2026-11-15" } };
    expect(refFormValue({ kind: "pdoc_y" }, data)).toBe("2026");
    expect(refFormValue({ kind: "pdoc_m" }, data)).toBe("11");
    expect(refFormValue({ kind: "pdoc_d" }, data)).toBe("14");
    expect(refFormValue({ kind: "docall_d" }, data)).toBe("15");
  });
});

describe("書類作成日が保存されていないとき", () => {
  it("全様式共通 → 支援計画書 → 作った日の順に使う", () => {
    const base = { ...REF_FORM_SAMPLE_DATA, today: "2026-11-23", docDate: "" };
    expect(refFormValue({ kind: "docall_d" }, { ...base, planDates: {} })).toBe("23");
    expect(refFormValue({ kind: "docall_d" }, { ...base, planDates: { doc: "2026-11-14" } })).toBe("14");
    expect(refFormValue({ kind: "docall_d" }, { ...base, planDates: { doc: "2026-11-14", docAll: "2026-11-15" } })).toBe("15");
    expect(refFormValue({ kind: "plan_doc", fmt: "d" }, { ...base, planDates: {} })).toBe("23");
    expect(refFormValue({ kind: "plan_docAll", fmt: "m" }, { ...base, planDates: {} })).toBe("11");
    expect(refFormValue({ kind: "plan_es", fmt: "d" }, { ...base, planDates: {} })).toBe(""); // ほかの日付は空のまま
  });
});

describe("一気にダウンロードはフォントを1回だけ入れる", () => {
  it("様式が増えても大きさがほとんど変わらない・署名ページだけも選べる", async () => {
    const make = async (n: number) => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < n; i++) doc.addPage([595, 842]);
      return doc.save();
    };
    const font = readFileSync(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const layout = normalizeRefFormLayout([{ kind: "name", page: 0, x: 50, y: 50, size: 12 }]);
    const data = { ...REF_FORM_SAMPLE_DATA, today: "2026-11-16" };
    const one = await fillRefFormsMerged(font, [{ pdfBytes: await make(2), layout, data }]);
    const five = await fillRefFormsMerged(
      font,
      await Promise.all([1, 2, 3, 4, 5].map(async () => ({ pdfBytes: await make(2), layout, data }))),
    );
    expect(five.length).toBeLessThan(one.length * 1.2);
    expect((await PDFDocument.load(five)).getPageCount()).toBe(10);
    const sign = await fillRefFormsMerged(font, [{ pdfBytes: await make(3), layout, data, onlyPages: [2] }]);
    expect((await PDFDocument.load(sign)).getPageCount()).toBe(1);
  }, 30000);
});

describe("作成画面で変えた文字の大きさ", () => {
  it("moves の中の __sizes から読み、記入位置に重ねる", async () => {
    const { normalizeRefFormEdits, applyRefFormEdits, refFormMovesForSave, normalizeRefFormLayout } = await import("./ref-form");
    const saved = refFormMovesForSave({ a: { x: 1, y: 2 } }, { b: 7.3, c: 100 });
    const edits = normalizeRefFormEdits({ moves: saved });
    expect(edits.moves).toEqual({ a: { x: 1, y: 2 } });
    expect(edits.sizes).toEqual({ b: 7.5, c: 40 }); // 0.5pt 刻み・上限 40pt
    const layout = normalizeRefFormLayout([
      { id: "b", kind: "name", page: 0, x: 10, y: 10, size: 11 },
      { id: "d", kind: "name", page: 0, x: 10, y: 30, size: 11 },
    ]);
    const out = applyRefFormEdits(layout, edits);
    expect(out.find((i) => i.id === "b")?.size).toBe(7.5);
    expect(out.find((i) => i.id === "d")?.size).toBe(11);
    // 送られてきた sizes（作成画面から）もそのまま読む
    expect(normalizeRefFormEdits({ sizes: { b: 6 } }).sizes).toEqual({ b: 6 });
  });
});
