import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { fill311, type ContractChangeFillData } from "./contract-change-forms";

const FORMS_DIR = path.join(__dirname, "../../public/forms");

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function loadSheet(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(Buffer.from(bytes)));
  return wb.worksheets[0];
}

const data: ContractChangeFillData = {
  workerName: "TEST TARO",
  gender: "男",
  birth: "1990-12-03",
  nationality: "ベトナム",
  residenceCardNo: "AB12345678CD",
  field: "農業分野",
  businessCategory: "耕種農業",
  changedOn: "2026-09-01",
  changeItems: ["I", "VII"],
  orgCorporateNo: "1234567890123",
  orgName: "テスト株式会社",
  orgAddress: "熊本県八代市1-2-3",
  orgStaff: "担当 太郎",
  orgPhone: "096-000-0000",
};

describe("fill311（参考様式第3-1-1号）", () => {
  it("対象者・変更年月日・届出機関を転記する", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-1.xlsx")));
    const ws = await loadSheet(await fill311(template, data));

    // ① 届出の対象者
    expect(ws.getCell("I15").text).toBe("TEST TARO");
    expect(ws.getCell("AE15").text).toBe("男");
    expect(ws.getCell("I18").text).toBe("1990");
    expect(ws.getCell("O18").text).toBe("12");
    expect(ws.getCell("S18").text).toBe("3");
    expect(ws.getCell("AC18").text).toBe("ベトナム");
    expect(ws.getCell("I26").text).toBe("農業分野");
    expect(ws.getCell("AB26").text).toBe("耕種農業");
    // 在留カード番号は1文字ずつマスへ
    expect(ws.getCell("I23").text).toBe("A");
    expect(ws.getCell("K23").text).toBe("B");
    expect(ws.getCell("AE23").text).toBe("D");

    // ② ａ 変更年月日
    expect(ws.getCell("J31").text).toBe("2026");
    expect(ws.getCell("P31").text).toBe("9");
    expect(ws.getCell("T31").text).toBe("1");

    // ③ 届出機関。法人番号は1桁ずつ
    expect(ws.getCell("I49").text).toBe("1");
    expect(ws.getCell("AG49").text).toBe("3");
    expect(ws.getCell("I52").text).toBe("テスト株式会社");
    expect(ws.getCell("I55").text).toBe("〒　熊本県八代市1-2-3");
    expect(ws.getCell("I59").text).toBe("担当 太郎");
    expect(ws.getCell("AA59").text).toBe("096-000-0000");
  });

  it("選んだ変更事項だけ☑になり、選ばなかったものは□のまま", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-1.xlsx")));
    const ws = await loadSheet(await fill311(template, data));

    expect(ws.getCell("E38").text).toBe("☑"); // Ⅰ.雇用契約期間
    expect(ws.getCell("S38").text).toBe("☑"); // Ⅶ.賃金
    expect(ws.getCell("E39").text).toBe("□"); // Ⅱ.就業の場所
    expect(ws.getCell("N38").text).toBe("□"); // Ⅳ.労働時間等
    expect(ws.getCell("S40").text).toBe("□"); // Ⅸ.その他
  });

  it("住所が空ならテンプレートの〒欄をそのまま残す", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-1.xlsx")));
    const ws = await loadSheet(await fill311(template, { ...data, orgAddress: "  " }));
    expect(ws.getCell("I55").text).toContain("〒");
    expect(ws.getCell("I55").text).not.toContain("熊本県");
  });

  it("法人でない（法人番号が空）ときはマスを空欄のままにする", async () => {
    const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, "sanko-3-1-1.xlsx")));
    const ws = await loadSheet(await fill311(template, { ...data, orgCorporateNo: "" }));
    expect(ws.getCell("I49").text).toBe("");
    expect(ws.getCell("AG49").text).toBe("");
  });
});
