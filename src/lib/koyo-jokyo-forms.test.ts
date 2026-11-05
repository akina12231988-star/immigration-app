import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillKoyoJokyo3, type KoyoJokyoFillData } from "./koyo-jokyo-forms";

const FORMS_DIR = path.join(process.cwd(), "public", "forms");

const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

const data: KoyoJokyoFillData = {
  workerName: "NGUYEN THI TUYEN",
  kana: "グエン ティ チュエン",
  residenceStatus: "特定技能1号",
  field: "農業",
  residenceExpiryDate: "2027-05-08",
  birth: "1991-04-23",
  gender: "女",
  nationality: "ベトナム",
  residenceCardNo: "LJ09023366RG",
  hiredOn: "2026-05-08",
  leavingOn: "2026-09-29",
  officeName: "村田 敬一",
  officeAddress: "〒866-0021 熊本県八代市郡築四番町102-7",
  officeTel: "0965-37-0822",
  ownerName: "村田 敬一",
};

async function documentXml(file: string): Promise<string> {
  const template = toArrayBuffer(await readFile(path.join(FORMS_DIR, file)));
  const bytes = await fillKoyoJokyo3(template, data);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  return (await zip.file("word/document.xml")!.async("string")) as string;
}

// 標題の語に取り消し線が付いているか（その語を含む run の書式を見る）
function isStruck(xml: string, word: string): boolean {
  const i = xml.indexOf(`<w:t>${word}</w:t>`);
  const runStart = xml.lastIndexOf("<w:r ", i);
  return xml.slice(runStart, i).includes("<w:strike");
}

describe("外国人雇用状況届出書（離職）", () => {
  it("標題の「雇入れ」を抹消し、離職年月日・主たる事務所まで転記する", async () => {
    const xml = await documentXml("koyo-jokyo-3-rishoku.docx");
    expect(isStruck(xml, "雇入れ")).toBe(true);
    expect(isStruck(xml, "離職")).toBe(false);
    expect(xml).toContain("2026年9月29日");
    expect(xml).toContain("2026年5月8日");
    expect(xml).toContain(")　村田 敬一");
    expect(xml).toContain("TEL</w:t>");
    expect(xml).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it("雇入れ用の様式はこれまでどおり「離職」を抹消し、置き換え残りが無い", async () => {
    const xml = await documentXml("koyo-jokyo-3.docx");
    expect(isStruck(xml, "離職")).toBe(true);
    expect(isStruck(xml, "雇入れ")).toBe(false);
    expect(xml).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });
});
