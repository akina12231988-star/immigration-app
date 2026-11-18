import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  REF_FORM_ITEMS,
  REF_FORM_SAMPLE_DATA,
  fillRefForm,
  languageForNationality,
  mergeRefForms,
  normalizeRefFormLayout,
  normalizeSignPages,
  parseRefFormMode,
  pickRefFormTemplate,
  refFormFileName,
  refFormName,
  refFormPagesFor,
  refFormValue,
  refFormCircleShown,
} from "./ref-form";

describe("参考様式の行", () => {
  it("提出書類一覧表のうち参考様式の書類だけ", () => {
    const keys = REF_FORM_ITEMS.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["t1-4-1", "t1-5", "t1-6-1", "t1-6-2", "t1-7-1", "t1-8-1", "t1-17", "t1-18", "t1-19", "t3a-2", "t3a-4"]));
    expect(keys).not.toContain("t1-9"); // 市区町村が発行する書類
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
  it("国籍の言語 → 日本語 → 最初のもの", () => {
    expect(languageForNationality("ベトナム")).toBe("ベトナム語");
    expect(languageForNationality("カンボジア")).toBe("クメール語");
    expect(pickRefFormTemplate(ts, "t1-5", "ベトナム")?.id).toBe("b");
    expect(pickRefFormTemplate(ts, "t1-5", "インドネシア")?.id).toBe("a");
    expect(pickRefFormTemplate(ts, "t1-6-1", "ベトナム")?.id).toBe("c");
    expect(pickRefFormTemplate(ts, "t1-17", "ベトナム")).toBeNull();
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
    expect(refFormValue({ kind: "today" }, d)).toBe("令和8年11月16日");
    expect(refFormValue({ kind: "today_seireki" }, d)).toBe("2026年11月16日");
    expect(refFormValue({ kind: "text", text: "同意します" }, d)).toBe("同意します");
  });

  it("年齢は作成日の時点の満年齢（誕生日の前日までは1つ少ない）", () => {
    expect(refFormValue({ kind: "age" }, d)).toBe("31");
    const p = { ...d.person, birth: "1995-11-17" };
    expect(refFormValue({ kind: "age" }, { ...d, person: p })).toBe("30");
    expect(refFormValue({ kind: "age" }, { ...d, person: { ...p, birth: "1995-11-16" } })).toBe("31");
    expect(refFormValue({ kind: "age" }, { ...d, person: { ...p, birth: null } })).toBe("");
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

  it("ファイル名", () => {
    expect(refFormFileName("all", "NGUYEN VAN A")).toBe("NGUYEN VAN A_参考様式一式.pdf");
    expect(refFormFileName("sign", "A/B")).toBe("AB_署名ページ.pdf");
    expect(refFormFileName("one", "A", "t1-5")).toBe("A_参考様式第1-5号.pdf");
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
