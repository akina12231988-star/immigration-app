import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { fill332, type SupportEndFillData } from "./support-end-forms";

const FORMS_DIR = path.join(__dirname, "../../public/forms");

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function loadSheet(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(Buffer.from(bytes)));
  return wb.worksheets[0];
}

// 特定技能2号へ移行して支援委託契約が終わるときの記録
const data: SupportEndFillData = {
  workerName: "TEST TARO",
  gender: "男",
  birth: "1990-12-03",
  nationality: "ベトナム",
  residenceCardNo: "AB12345678CD",
  field: "農業分野",
  businessCategory: "耕種農業",
  endedOn: "2026-09-09", // 2号の許可日 2026-09-10 の前の日
  majorReason: "期間満了",
  minorReason: "その他",
  otherReason: "特定技能２号へ移行した為",
  orgCorporateNo: "1234567890123",
  orgName: "テスト株式会社",
  orgAddress: "熊本県八代市1-2-3",
  orgStaff: "担当 太郎",
  orgPhone: "096-000-0000",
};

async function fill(over: Partial<SupportEndFillData> = {}) {
  const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-3-2.xlsx")));
  return loadSheet(await fill332(template, { ...data, ...over }));
}

describe("fill332（参考様式第3-3-2号）", () => {
  it("対象者・終了年月日・届出機関を転記する", async () => {
    const ws = await fill();

    // ① 届出の対象者（特定技能1号のときの内容）
    expect(ws.getCell("I19").text).toBe("TEST TARO");
    expect(ws.getCell("AE19").text).toBe("男");
    expect(ws.getCell("I22").text).toBe("1990");
    expect(ws.getCell("O22").text).toBe("12");
    expect(ws.getCell("S22").text).toBe("3");
    expect(ws.getCell("AC22").text).toBe("ベトナム");
    expect(ws.getCell("I30").text).toBe("農業分野");
    expect(ws.getCell("AB30").text).toBe("耕種農業");
    expect(ws.getCell("I27").text).toBe("A");
    expect(ws.getCell("AE27").text).toBe("D");

    // Ａa 終了年月日
    expect(ws.getCell("J60").text).toBe("2026");
    expect(ws.getCell("P60").text).toBe("9");
    expect(ws.getCell("T60").text).toBe("9");

    // ③ 届出機関
    expect(ws.getCell("I100").text).toBe("1");
    expect(ws.getCell("AG100").text).toBe("3");
    expect(ws.getCell("I103").text).toBe("テスト株式会社");
    expect(ws.getCell("I106").text).toBe("〒　熊本県八代市1-2-3");
    expect(ws.getCell("I110").text).toBe("担当 太郎");
    expect(ws.getCell("AA110").text).toBe("096-000-0000");
  });

  it("②は「支援委託契約の終了」だけにチェックする", async () => {
    const ws = await fill();
    expect(ws.getCell("B36").text).toBe("☑"); // 支援委託契約の終了
    expect(ws.getCell("B43").text).toBe("□"); // 締結
    expect(ws.getCell("B50").text).toBe("□"); // 終了と締結
  });

  it("終了の事由は大分類・小分類をそれぞれ1つだけ☑にし、その他は（）に理由を書く", async () => {
    const ws = await fill();
    expect(ws.getCell("M63").text).toBe("☑"); // 委託契約の期間満了
    expect(ws.getCell("M64").text).toBe("□");
    expect(ws.getCell("M65").text).toBe("□");
    expect(ws.getCell("M67").text).toBe("□"); // 期間満了
    expect(ws.getCell("M71").text).toBe("☑"); // その他
    expect(ws.getCell("N71").text).toBe("その他（　特定技能２号へ移行した為　）");
  });

  it("その他以外の事由なら（）の欄はテンプレートのまま", async () => {
    const ws = await fill({ minorReason: "期間満了" });
    expect(ws.getCell("M67").text).toBe("☑");
    expect(ws.getCell("M71").text).toBe("□");
    expect(ws.getCell("N71").text).toContain("その他");
    expect(ws.getCell("N71").text).not.toContain("特定技能");
  });

  it("法人でない（法人番号が空）ときはマスを空欄のままにする", async () => {
    const ws = await fill({ orgCorporateNo: "" });
    expect(ws.getCell("I100").text).toBe("");
    expect(ws.getCell("AG100").text).toBe("");
  });
});
