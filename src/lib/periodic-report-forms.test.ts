import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { fill36, fill36Besshi1, report36B1FileName, report36FileName } from "@/lib/periodic-report-forms";
import type { Section36 } from "@/lib/periodic-report";

async function template(name: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), "public", "forms", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function sheetXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("xl/worksheets/sheet1.xml")!.async("string");
}

const section: Section36 = {
  months: 23,
  workDays: 21,
  regularHours: 168,
  overtimeHours: 10,
  cashPay: 232000,
  overtimePay: 17000,
  commute: 5000,
  attendance: 0,
  family: 0,
  bonus: 100000,
  food: 0,
  housing: 20000,
  taxSocial: 32000,
  otherDeduction: 0,
  note: "",
};

describe("fill36（3-6号 本紙）", () => {
  it("期間・法人番号・人数・平均・昇給率・支援の実施状況が入る", async () => {
    const bytes = await fill36(await template("sanko-3-6.xlsx"), {
      fy: 2025,
      corporateNo: "1234567890123",
      fieldName: "農業",
      fieldCount: 1,
      orgKana: "かぶしきがいしゃ　さんぷる",
      orgName: "株式会社サンプル",
      postal: "1234567",
      address: "東京都サンプル区1-2-3",
      phone: "03-1234-5678",
      count1: 2,
      count2: 0,
      one: section,
      two: null,
      raise1: 5,
      raise2: null,
      supportDelegated: true,
      note: "",
      staffName: "担当 花子",
      staffPhone: "03-1234-5678",
    });
    const xml = await sheetXml(bytes);
    expect(xml).toContain("2025年４月１日　～　2026年３月３１日");
    expect(xml).toContain("株式会社サンプル");
    expect(xml).toContain("〒123－4567　東京都サンプル区1-2-3");
    expect(xml).toContain("2　人"); // 合計
    expect(xml).toContain("平均　21　日／月");
    expect(xml).toContain("平均　232,000　円／月");
    expect(xml).toContain("平均　100,000　円");
    expect(xml).toContain("平均　5.0　％");
    expect(xml).toContain("☑ 支援の全部委託あり");
    // 2号の欄は書かない（セルM30はテンプレートの共有文字列の参照のまま）
    expect(xml).toMatch(/<c r="M30"[^>]*t="s"/);
    expect(xml).toMatch(/<c r="F30"[^>]*t="inlineStr"/); // 1号の欄は書き込まれている
  });

  it("法人番号が空ならマスは空欄のまま。複数分野なら※欄に合計数", async () => {
    const bytes = await fill36(await template("sanko-3-6.xlsx"), {
      fy: 2025,
      corporateNo: "",
      fieldName: "農業",
      fieldCount: 2,
      orgKana: "",
      orgName: "個人 太郎",
      postal: "",
      address: "熊本県",
      phone: "",
      count1: 1,
      count2: 0,
      one: section,
      two: null,
      raise1: null,
      raise2: null,
      supportDelegated: false,
      note: "法人番号未指定",
      staffName: "",
      staffPhone: "",
    });
    const xml = await sheetXml(bytes);
    expect(xml).toContain("計( 2 )分野受入れ");
    expect(xml).toContain("☑ 自社支援のみ");
    expect(xml).toContain("法人番号未指定");
  });
});

describe("fill36Besshi1（別紙1）", () => {
  it("1人分の氏名・生年月日・性別・在留カード・総数・支払方法・支援の形態・備考が入る", async () => {
    const bytes = await fill36Besshi1(await template("sanko-3-6-b1.xlsx"), {
      orgName: "株式会社サンプル",
      officeName: "本社",
      supportDelegated: true,
      supportOrgName: "サンプル支援機関",
      staffName: "支援 太郎",
      staffPhone: "03-9876-5432",
      workers: [
        {
          name: "NGUYEN VAN A",
          nationality: "ベトナム",
          birth: "1998-05-02",
          gender: "男",
          cardNo: "AB12345678CD",
          field: "農業",
          days: 252,
          pay: 2860000,
          payBank: true,
          note: "受入れ開始日: 2025年8月20日",
        },
      ],
    });
    const xml = await sheetXml(bytes);
    expect(xml).toContain("NGUYEN VAN A");
    expect(xml).toContain("1998年5月2日");
    expect(xml).toContain("AB12345678CD");
    expect(xml).toContain("<v>252</v>"); // 活動日数は数値で入る
    expect(xml).toContain("<v>2860000</v>");
    expect(xml).toContain("☑ 預貯金口座");
    expect(xml).toContain("☑ 登録支援機関に全部委託");
    expect(xml).toContain("機関名：サンプル支援機関");
    expect(xml).toContain("受入れ開始日: 2025年8月20日");
    expect(xml).toContain("事業所の名称：本社");
  });
});

describe("ファイル名", () => {
  it("機関名と年度・ページを入れる", () => {
    expect(report36FileName("株式会社A/B", 2025)).toBe("参考様式第3-6号_2025年度_株式会社A-B.xlsx");
    expect(report36B1FileName("株式会社サンプル", 2025, 2, 3)).toBe("参考様式第3-6号別紙1_2025年度_株式会社サンプル_2枚目.xlsx");
    expect(report36B1FileName("株式会社サンプル", 2025, 1, 1)).toBe("参考様式第3-6号別紙1_2025年度_株式会社サンプル.xlsx");
  });
});
