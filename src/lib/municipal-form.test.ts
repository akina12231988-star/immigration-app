import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  MUNICIPAL_FORM_DOCS,
  addressAfterCity,
  applyMunicipalTextOverrides,
  splitPhone,
  parseMunicipalFormDoc,
  fillMunicipalForm,
  guessAcroFieldKind,
  municipalFormValue,
  normalizeMunicipalFormLayout,
  type MunicipalFormPerson,
} from "./municipal-form";

const person: MunicipalFormPerson = {
  name: "NGUYEN VAN A",
  kana: "グエン ヴァン ア",
  birth: "1995-03-08",
  nationality: "ベトナム",
  postalCode: "8660021",
  address: "熊本県八代市郡築四番町102-7",
  yearAddress: "熊本県八代市本町1-1-1",
  fiscalYear: 2026,
  today: "2026-11-07",
};

describe("municipalFormValue", () => {
  it("項目ごとの文字", () => {
    expect(municipalFormValue({ kind: "name" }, person)).toBe("NGUYEN VAN A");
    expect(municipalFormValue({ kind: "birth_seireki" }, person)).toBe("1995年3月8日");
    expect(municipalFormValue({ kind: "postal" }, person)).toBe("〒866-0021");
    expect(municipalFormValue({ kind: "fiscal_year" }, person)).toBe("令和8年度");
    expect(municipalFormValue({ kind: "income_year" }, person)).toBe("令和7年中");
    expect(municipalFormValue({ kind: "fiscal_year_num" }, person)).toBe("8");
    expect(municipalFormValue({ kind: "income_year_num" }, person)).toBe("7");
    expect(municipalFormValue({ kind: "year_address" }, person)).toBe("熊本県八代市本町1-1-1");
    expect(municipalFormValue({ kind: "year_address" }, { ...person, yearAddress: "" })).toBe(person.address);
    expect(municipalFormValue({ kind: "text", text: "入管手続き" }, person)).toBe("入管手続き");
    expect(municipalFormValue({ kind: "check" }, person)).toBe("");
    expect(municipalFormValue({ kind: "birth_era" }, person)).toBe("平成");
    expect(municipalFormValue({ kind: "birth_y" }, person)).toBe("7");
    expect(municipalFormValue({ kind: "birth_m" }, person)).toBe("3");
    expect(municipalFormValue({ kind: "today_y" }, person)).toBe("8");
    expect(municipalFormValue({ kind: "today_m" }, person)).toBe("11");
    expect(municipalFormValue({ kind: "today_d" }, person)).toBe("7");
  });
});

describe("addressAfterCity", () => {
  it("都道府県と市区町村を取り除く", () => {
    expect(addressAfterCity("熊本県八代市郡築四番町102-7")).toBe("郡築四番町102-7");
    expect(addressAfterCity("熊本県八代郡氷川町島地1-2")).toBe("島地1-2");
    expect(addressAfterCity("八代市本町1-1-1")).toBe("本町1-1-1");
    expect(addressAfterCity("東京都新宿区西新宿2-8-1")).toBe("西新宿2-8-1");
  });
});

describe("normalizeMunicipalFormLayout", () => {
  it("壊れた行や知らない項目は捨てる", () => {
    const out = normalizeMunicipalFormLayout([
      { id: "a", kind: "name", page: 0, x: 10, y: 20, size: 11 },
      { kind: "unknown", x: 1 },
      null,
      { kind: "kana", x: "x", size: 100 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ kind: "kana", x: 0, size: 40 });
    expect(normalizeMunicipalFormLayout("x")).toEqual([]);
  });
});

describe("guessAcroFieldKind", () => {
  it("入力欄の名前から推測する", () => {
    expect(guessAcroFieldKind("申請者 氏名")).toBe("name");
    expect(guessAcroFieldKind("フリガナ")).toBe("kana");
    expect(guessAcroFieldKind("住所1")).toBe("address");
    expect(guessAcroFieldKind("生年月日")).toBe("birth_wareki");
    expect(guessAcroFieldKind("Text12")).toBeNull();
  });
});

describe("fillMunicipalForm", () => {
  it("記入位置どおりに書き込んだPDFを作る（ページ数は変わらない）", async () => {
    const src = await PDFDocument.create();
    src.addPage([595, 842]);
    const bytes = await src.save();
    const font = await readFile(path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"));
    const out = await fillMunicipalForm(bytes, font, normalizeMunicipalFormLayout([
      { kind: "name", page: 0, x: 100, y: 100, size: 12, maxWidth: 50 },
      { kind: "address", page: 0, x: 100, y: 130, size: 10 },
      { kind: "check", page: 0, x: 50, y: 200, size: 10 },
      { kind: "circle", page: 0, x: 80, y: 200, size: 14 },
      { kind: "name", page: 3, x: 0, y: 0, size: 10 },
    ]), person);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
  }, 20000);
});

describe("住民票の申請書・委任状（0231）", () => {
  it("書類の種類を読み、保存先の列が別になる", () => {
    expect(parseMunicipalFormDoc("juminhyo")).toBe("juminhyo");
    expect(parseMunicipalFormDoc("juminhyo_proxy")).toBe("juminhyo_proxy");
    expect(parseMunicipalFormDoc("nope")).toBe("cert");
    expect(MUNICIPAL_FORM_DOCS.juminhyo.pathCol).toBe("juminhyo_form_pdf_path");
    expect(MUNICIPAL_FORM_DOCS.juminhyo_proxy.layoutCol).toBe("juminhyo_proxy_form_layout");
    expect(MUNICIPAL_FORM_DOCS.juminhyo.migration).toBe("0231_municipality_juminhyo_form_pdf.sql");
  });
});

describe("納税証明書の申請書（課税証明書と別の様式・0232）", () => {
  it("書類の種類を読み、保存先の列が別になる", () => {
    expect(parseMunicipalFormDoc("nozei")).toBe("nozei");
    expect(MUNICIPAL_FORM_DOCS.nozei.pathCol).toBe("nozei_form_pdf_path");
    expect(MUNICIPAL_FORM_DOCS.nozei.migration).toBe("0232_municipality_nozei_form_pdf.sql");
  });
});

describe("自由な文字を請求ごとに直す", () => {
  const layout = [
    { id: "a", kind: "text", text: "入管へ在留資格の手続きのため" },
    { id: "b", kind: "name" },
  ];
  it("自由な文字だけ書き換える。読めない値は無視", () => {
    const out = applyMunicipalTextOverrides(layout, JSON.stringify({ a: "就職のため", b: "x" }));
    expect(out[0].text).toBe("就職のため");
    expect(out[1]).toEqual({ id: "b", kind: "name" });
    expect(applyMunicipalTextOverrides(layout, "壊れた")).toBe(layout);
    expect(applyMunicipalTextOverrides(layout, null)).toBe(layout);
  });
});

describe("代理人の欄", () => {
  const p: MunicipalFormPerson = {
    name: "", kana: "", birth: null, nationality: "", postalCode: "", address: "", yearAddress: "", fiscalYear: null, today: "2026-11-19",
    agent: { name: "野口明菜", address: "熊本市", birth: "1990-04-01", phone: "080-4281-1083" },
  };
  it("氏名・住所・生年月日・電話番号（3つに分けても）", () => {
    expect(municipalFormValue({ kind: "agent_name" }, p)).toBe("野口明菜");
    expect(municipalFormValue({ kind: "agent_address" }, p)).toBe("熊本市");
    expect(municipalFormValue({ kind: "agent_birth_seireki" }, p)).toBe("1990年4月1日");
    expect(municipalFormValue({ kind: "agent_tel1" }, p)).toBe("080");
    expect(municipalFormValue({ kind: "agent_tel2" }, p)).toBe("4281");
    expect(municipalFormValue({ kind: "agent_tel3" }, p)).toBe("1083");
    expect(municipalFormValue({ kind: "agent_name" }, { ...p, agent: null })).toBe("");
  });
  it("電話番号の分け方", () => {
    expect(splitPhone("08042811083")).toEqual(["080", "4281", "1083"]);
    expect(splitPhone("0965-12-3456")).toEqual(["0965", "12", "3456"]);
    expect(splitPhone("0965123456")).toEqual(["096", "512", "3456"]);
  });
});
