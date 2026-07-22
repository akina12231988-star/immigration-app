import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  type FormFillData,
  defaultEndReason312,
  endReasonOptions312,
  fill312,
  fill34,
  fill511,
  genderMark,
} from "./resignation-forms";

const FORMS_DIR = path.join(__dirname, "../../public/forms");

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const companyData: FormFillData = {
  kind: "会社都合",
  workerName: "TEST TARO",
  gender: "男",
  birth: "1990-12-03",
  nationality: "ベトナム",
  address: "東京都新宿区1-2-3",
  residenceCardNo: "AB12345678CD",
  field: "農業分野",
  businessCategory: "耕種農業全般",
  leavingOn: "2026-07-31",
  reason: "事業所閉鎖のため",
  endReason: "05",
  supportRegNo: "２０登-005746",
  supportName: "SUPPORT NAME",
  supportAddress: "熊本県熊本市",
  orgName: "テスト株式会社",
  orgAddress: "熊本県八代市",
  orgPhone: "096-000-0000",
  orgStaff: "担当 太郎",
  contactStatus: "連絡可能",
  intention: "活動継続の意思なし（転職希望）",
  measure: "転職支援実施予定",
  reportOn: "2026-08-01",
};

const selfData: FormFillData = {
  ...companyData,
  kind: "自己都合",
  endReason: "10",
  reason: "家庭の事情により帰国",
};

async function loadSheet(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(Buffer.from(bytes)));
  return wb.worksheets[0];
}

describe("defaultEndReason312 / endReasonOptions312", () => {
  it("会社都合は05その他、自己都合は10自己都合退職が既定", () => {
    expect(defaultEndReason312("会社都合")).toBe("05");
    expect(defaultEndReason312("自己都合")).toBe("10");
  });
  it("選択肢は退職区分に応じて絞られる（01は共通）", () => {
    const company = endReasonOptions312("会社都合").map((r) => r.code);
    expect(company).toEqual(["01", "02", "03", "04", "05"]);
    const self = endReasonOptions312("自己都合").map((r) => r.code);
    expect(self).toEqual(["01", "06", "07", "08", "09", "10", "11"]);
  });
});

describe("genderMark", () => {
  it("男/女/英字表記を判定し、不明は空", () => {
    expect(genderMark("男")).toBe("男");
    expect(genderMark("女性")).toBe("女");
    expect(genderMark("Male")).toBe("男");
    expect(genderMark("Female")).toBe("女");
    expect(genderMark("")).toBe("");
  });
});

describe("fill312", () => {
  it("会社都合: 対象者・終了日・05その他（理由）・登録支援機関・届出機関を転記する", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-2.xlsx")));
    const ws = await loadSheet(await fill312(template, companyData));

    expect(ws.getCell("I16").value).toBe("TEST TARO");
    expect(ws.getCell("AE16").value).toBe("男");
    expect(ws.getCell("I19").value).toBe("1990");
    expect(ws.getCell("O19").value).toBe("12");
    expect(ws.getCell("S19").value).toBe("3");
    expect(ws.getCell("AC19").value).toBe("ベトナム");
    expect(ws.getCell("I22").value).toBe("東京都新宿区1-2-3");
    // 在留カード番号は1文字ずつ
    expect(ws.getCell("I27").value).toBe("A");
    expect(ws.getCell("K27").value).toBe("B");
    expect(ws.getCell("AE27").value).toBe("D");
    // ② 契約の終了にチェック
    expect(ws.getCell("B35").value).toBe("☑");
    expect(ws.getCell("M35").value).toBe("□");
    // 終了年月日
    expect(ws.getCell("M42").value).toBe("2026");
    expect(ws.getCell("S42").value).toBe("7");
    expect(ws.getCell("W42").value).toBe("31");
    // 会社都合: 親（所属機関の都合）＋05その他に理由
    expect(ws.getCell("D49").value).toBe("☑");
    expect(ws.getCell("D55").value).toBe("□");
    expect(ws.getCell("E53").value).toBe("☑");
    expect(ws.getCell("F53").value).toBe("05.その他（　事業所閉鎖のため　）");
    // 委託契約・登録支援機関
    expect(ws.getCell("J71").value).toBe("2026");
    expect(ws.getCell("J74").value).toBe("２０登-005746");
    expect(ws.getCell("J80").value).toBe("SUPPORT NAME");
    // 届出機関
    expect(ws.getCell("I101").value).toBe("テスト株式会社");
    expect(ws.getCell("AA108").value).toBe("096-000-0000");
    // 作成年月日
    expect(ws.getCell("U116").value).toBe("2026");
    expect(ws.getCell("AA116").value).toBe("8");
    expect(ws.getCell("AE116").value).toBe("1");
  });

  it("自己都合: 外国人の都合＋10自己都合退職にチェックする", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-2.xlsx")));
    const ws = await loadSheet(await fill312(template, selfData));
    expect(ws.getCell("D49").value).toBe("□");
    expect(ws.getCell("D55").value).toBe("☑");
    expect(ws.getCell("E60").value).toBe("☑");
    expect(ws.getCell("E53").value).toBe("□");
    // 05その他の括弧は空欄のまま
    expect(String(ws.getCell("F53").value)).toContain("05.その他");
  });
});

describe("fill34", () => {
  it("会社都合の届出書に対象者・事由・現状・措置・届出機関を転記する", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-4.xlsx")));
    const ws = await loadSheet(await fill34(template, companyData));

    expect(ws.getCell("H19").value).toBe("TEST TARO");
    expect(ws.getCell("AD19").value).toBe("男");
    expect(ws.getCell("H22").value).toBe("1990");
    expect(ws.getCell("AB22").value).toBe("ベトナム");
    expect(ws.getCell("H30").value).toBe("A");
    expect(ws.getCell("AD30").value).toBe("D");
    // ② 所属機関の都合にチェック
    expect(ws.getCell("F39").value).toBe("☑");
    expect(ws.getCell("T39").value).toBe("□");
    // 05その他 → 事由の区分もその他＋理由
    expect(ws.getCell("K51").value).toBe("☑");
    expect(ws.getCell("L51").value).toBe("その他（　事業所閉鎖のため　）");
    // 事由発生日・事案の概要
    expect(ws.getCell("J54").value).toBe("2026");
    expect(ws.getCell("P54").value).toBe("7");
    expect(ws.getCell("T54").value).toBe("31");
    expect(ws.getCell("J58").value).toBe("事業所閉鎖のため");
    // ③④
    expect(ws.getCell("K86").value).toBe("☑");
    expect(ws.getCell("I94").value).toBe("☑");
    expect(ws.getCell("I100").value).toBe("☑");
    // ⑤ 届出機関・作成年月日
    expect(ws.getCell("I111").value).toBe("テスト株式会社");
    expect(ws.getCell("U127").value).toBe("2026");
  });

  it("経営上の都合を選ぶとK48にチェックされる", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-4.xlsx")));
    const ws = await loadSheet(await fill34(template, { ...companyData, endReason: "02" }));
    expect(ws.getCell("K48").value).toBe("☑");
    expect(ws.getCell("K51").value).toBe("□");
  });
});

describe("fill511", () => {
  it("氏名・機関名・作成年月日のトークンを置換する", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-5-11.docx")));
    const bytes = await fill511(template, companyData);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("TEST TARO");
    expect(xml).toContain("テスト株式会社");
    expect(xml).toContain("2026年");
    expect(xml).not.toContain("{{WORKER_NAME}}");
    expect(xml).not.toContain("{{ORG_NAME}}");
    expect(xml).not.toContain("{{DATE}}");
    expect(xml).not.toContain("{{STAFF_NAME}}");
    expect(xml).not.toContain("{{CONTACT_NAME}}");
  });
});
