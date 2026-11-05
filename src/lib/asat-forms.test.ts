import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  asatCategoryOf,
  asatIdentityIssues,
  asatSeiyakushoTokens,
  asatShomeishoTokens,
  fillAsatDocx,
  type AsatShomeishoData,
} from "./asat-forms";
import { mrzCheckDigit, parseMrz } from "./mrz";

const FORMS = path.join(process.cwd(), "public", "forms");
const load = async (f: string) => {
  const b = await readFile(path.join(FORMS, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const xmlOf = async (bytes: Uint8Array) => {
  const { default: JSZip } = await import("jszip");
  return (await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string")) as string;
};
const textOf = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

const data: AsatShomeishoData = {
  name: "TRAN THI BICH THAO",
  birth: "1990-11-25",
  nationality: "ベトナム",
  certDate: "2026-11-05",
  orgName: "井上 洋介",
  orgAddress: "熊本県八代市郡築十一番町79-2",
  orgTel: "0965-37-0553",
  orgRep: "代表 井上洋介",
  periodStart: "2019-07-14",
  periodEnd: null,
  totalYears: 7,
  totalMonths: 3,
  employment: "直接雇用",
  category: "耕種農業全般",
};

// MRZ: TRAN THI BICH THAO / 1990-11-25 / VNM（チェックディジットは mrzCheckDigit で正しく付ける）
const cd = (v: string) => String(mrzCheckDigit(v));
const line1 = "P<VNMTRAN<<THI<BICH<THAO".padEnd(44, "<");
const no = "C1234567<";
const birth = "901125";
const expiry = "310101";
const optional = "<".repeat(14);
const body = `${no}${cd(no)}VNM${birth}${cd(birth)}F${expiry}${cd(expiry)}${optional}<`;
const composite = cd(`${no}${cd(no)}${birth}${cd(birth)}${expiry}${cd(expiry)}${optional}<`);
const MRZ = `${line1}\n${body}${composite}`;

describe("実務経験に係る証明書（様式第1号）", () => {
  it("氏名・生年月日・国籍・所属機関・就業期間を転記し、置き換え残りが無い", async () => {
    const xml = await xmlOf(await fillAsatDocx(await load("asat2-shomeisho.docx"), asatShomeishoTokens(data)));
    const text = textOf(xml);
    expect(text).toContain("TRAN THI BICH THAO");
    expect(text).toContain("1990年11月25日");
    expect(text).toContain("ベトナム");
    expect(text).toContain("証明日　2026年11月5日");
    expect(text).toContain("熊本県八代市郡築十一番町79-2");
    expect(text).toContain("計　　　7　年　　　3か月");
    expect(text).toContain("西暦　2019年　7月　14日～　　現在に至る");
    expect(xml).not.toMatch(/\{\{[A-Z_]+\}\}/);
    // 直接雇用・耕種農業全般はテンプレートの位置のまま
    expect(xml).toContain("<wp:posOffset>895985</wp:posOffset>");
    expect(xml).toContain("<wp:posOffset>545465</wp:posOffset>");
  });

  it("退職済みなら就業期間の終わりに日付を書き、派遣形態・畜産農業全般は丸を右へ動かす", async () => {
    const xml = await xmlOf(
      await fillAsatDocx(
        await load("asat2-shomeisho.docx"),
        asatShomeishoTokens({ ...data, periodEnd: "2025-03-31", employment: "派遣形態", category: "畜産農業全般" }),
      ),
    );
    expect(textOf(xml)).toContain("～　　2025年3月31日");
    expect(xml).not.toContain("<wp:posOffset>895985</wp:posOffset>");
    expect(xml).not.toContain("<wp:posOffset>545465</wp:posOffset>");
  });
});

describe("誓約書（様式第2号）", () => {
  it("私＿＿は の氏名・国籍・生年月日を転記する", async () => {
    const xml = await xmlOf(await fillAsatDocx(await load("asat2-seiyakusho.docx"), asatSeiyakushoTokens(data)));
    const text = textOf(xml);
    expect(text).toContain("私　TRAN THI BICH THAO　は、");
    expect(text).toContain("西暦　1990年　11月　25日");
    expect(text).toContain("ベトナム");
    expect(xml).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });
});

describe("氏名・生年月日・国籍の確認", () => {
  it("パスポート（MRZ）と同じなら問題なし", () => {
    expect(parseMrz(MRZ, "2026-11-05")).toMatchObject({ ok: true, surname: "TRAN", givenNames: "THI BICH THAO", birth: "1990-11-25" });
    expect(asatIdentityIssues(data, MRZ, "2026-11-05")).toEqual([]);
  });
  it("MRZと違えば作らせない", () => {
    const issues = asatIdentityIssues({ ...data, name: "TRAN THI BICH THAQ", birth: "1990-11-26", nationality: "カンボジア" }, MRZ, "2026-11-05");
    expect(issues.filter((i) => i.level === "error").map((i) => i.field)).toEqual(["氏名", "生年月日", "国籍"]);
  });
  it("未登録・アルファベット以外はエラー、MRZ未読み取りは注意", () => {
    const issues = asatIdentityIssues({ name: "チャン", birth: null, nationality: "" }, "", "2026-11-05");
    expect(issues.filter((i) => i.level === "error").map((i) => i.field)).toEqual(["氏名", "生年月日", "国籍"]);
    expect(issues.some((i) => i.level === "warn")).toBe(true);
  });
  it("業務区分は分野から決める", () => {
    expect(asatCategoryOf("農業・畜産農業全般")).toBe("畜産農業全般");
    expect(asatCategoryOf("農業")).toBe("耕種農業全般");
  });
});
