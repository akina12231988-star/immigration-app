import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  koyoFileName,
  koyoGenderMark,
  koyoJpDate,
  koyoVisaLabel,
  needsKoyoJokyoForm,
} from "./koyo-jokyo";
import { fillKoyoJokyo3, type KoyoJokyoFillData } from "./koyo-jokyo-forms";

describe("needsKoyoJokyoForm", () => {
  it("雇用保険の適用事業所が「いいえ」のときだけ必要", () => {
    expect(needsKoyoJokyoForm("いいえ")).toBe(true);
    expect(needsKoyoJokyoForm(" いいえ ")).toBe(true);
    expect(needsKoyoJokyoForm("はい")).toBe(false);
    expect(needsKoyoJokyoForm("")).toBe(false);
    expect(needsKoyoJokyoForm(null)).toBe(false);
  });
});

describe("koyoGenderMark", () => {
  it("該当する番号を丸囲みにする（○で囲む代わり）", () => {
    expect(koyoGenderMark("男")).toBe("①男・2女");
    expect(koyoGenderMark("女性")).toBe("1男・②女");
    expect(koyoGenderMark("Male")).toBe("①男・2女");
    expect(koyoGenderMark("Female")).toBe("1男・②女");
  });

  it("判定できないときは様式のまま（手書きで○を付ける）", () => {
    expect(koyoGenderMark("")).toBe("1男・2女");
    expect(koyoGenderMark("不明")).toBe("1男・2女");
  });
});

describe("koyoVisaLabel", () => {
  it("特定技能・特定活動は分野を括弧書きで足す", () => {
    expect(koyoVisaLabel("特定技能1号", "農業分野")).toBe("特定技能1号（農業分野）");
    expect(koyoVisaLabel("特定活動", "特定技能1号移行準備")).toBe(
      "特定活動（特定技能1号移行準備）",
    );
  });

  it("すでに括弧があるもの・他の在留資格はそのまま", () => {
    expect(koyoVisaLabel("特定技能1号（介護）", "介護分野")).toBe("特定技能1号（介護）");
    expect(koyoVisaLabel("技術・人文知識・国際業務", "農業分野")).toBe(
      "技術・人文知識・国際業務",
    );
    expect(koyoVisaLabel("特定技能1号", "")).toBe("特定技能1号");
  });
});

describe("koyoJpDate / koyoFileName", () => {
  it("西暦のYYYY年M月D日にする", () => {
    expect(koyoJpDate("2026-09-01")).toBe("2026年9月1日");
    expect(koyoJpDate(null)).toBe("");
    expect(koyoJpDate("2026/09/01")).toBe("");
  });

  it("ファイル名は「外国人雇用状況届出書_氏名」", () => {
    expect(koyoFileName("TEST TARO")).toBe("外国人雇用状況届出書_TEST TARO");
    expect(koyoFileName("A/B")).toBe("外国人雇用状況届出書_A-B");
  });
});

const data: KoyoJokyoFillData = {
  workerName: "TEST TARO",
  kana: "テスト　タロウ",
  residenceStatus: "特定技能1号",
  field: "農業分野",
  residenceExpiryDate: "2027-08-31",
  birth: "1990-12-03",
  gender: "男",
  nationality: "ベトナム",
  residenceCardNo: "AB12345678CD",
  hiredOn: "2026-09-01",
  officeName: "テスト株式会社",
  officeAddress: "熊本県八代市1-2-3",
  officeTel: "0965-00-0000",
  ownerName: "代表取締役　試験　太郎",
};

async function fillAndRead(over: Partial<KoyoJokyoFillData> = {}) {
  const buf = await readFile(
    path.join(__dirname, "../../public/forms/koyo-jokyo-3.docx"),
  );
  const template = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  const bytes = await fillKoyoJokyo3(template, { ...data, ...over });
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("word/document.xml")!.async("string");
}

describe("fillKoyoJokyo3（様式第3号）", () => {
  it("外国人の情報・雇入れ年月日・事業主の情報を転記する", async () => {
    const xml = await fillAndRead();
    for (const v of [
      "TEST TARO",
      "テスト　タロウ",
      "特定技能1号（農業分野）",
      "2027年8月31日",
      "1990年12月3日",
      "①男・2女",
      "ベトナム",
      "2026年9月1日",
      "テスト株式会社",
      "熊本県八代市1-2-3",
      "0965-00-0000",
      "代表取締役　試験　太郎",
    ]) {
      expect(xml).toContain(v);
    }
  });

  it("在留カード番号は1文字ずつマスに入る", async () => {
    const xml = await fillAndRead();
    // 12個のマスに1文字ずつ入るので、テンプレートのトークンは残らない
    expect(xml).not.toMatch(/\{\{C\d+\}\}/);
    // 先頭2文字と末尾2文字がそれぞれ独立した要素として入る
    expect(xml).toContain("<w:t xml:space=\"preserve\">A</w:t>");
    expect(xml).toContain("<w:t xml:space=\"preserve\">D</w:t>");
  });

  it("置き換え漏れのトークンが残らない", async () => {
    const xml = await fillAndRead();
    expect(xml).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it("雇入れの届出なので標題の「離職」に取り消し線が入っている", async () => {
    const xml = await fillAndRead();
    // テンプレートは自己終了タグに空白が入る形（<w:strike />）で保存されている
    expect(xml).toContain("<w:strike");
  });

  it("未登録の項目は空欄のままにする（様式は壊さない）", async () => {
    const xml = await fillAndRead({
      birth: null,
      residenceExpiryDate: null,
      hiredOn: null,
      residenceCardNo: "",
      gender: "",
    });
    expect(xml).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    // 性別は判定できないので様式のまま
    expect(xml).toContain("1男・2女");
  });
});
