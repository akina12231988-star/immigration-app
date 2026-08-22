import { describe, expect, it } from "vitest";
import {
  mrzCheckDigit,
  mrzCopyItems,
  mrzDate,
  mrzToWorkerFields,
  normalizeMrz,
  parseMrz,
  parseMrzName,
  splitMrzLines,
} from "./mrz";

const TODAY = "2026-08-21";

// ICAO Doc 9303 の例（TD3）。チェックディジットまで正しい2行
const LINE1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const LINE2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const SAMPLE = `${LINE1}\n${LINE2}`;

describe("mrzCheckDigit", () => {
  it("7-3-1 の重みづけで計算する", () => {
    expect(mrzCheckDigit("L898902C3")).toBe(6);
    expect(mrzCheckDigit("740812")).toBe(2);
    expect(mrzCheckDigit("120415")).toBe(9);
  });

  it("< は 0 として数える", () => {
    expect(mrzCheckDigit("<<<<<<")).toBe(0);
  });
});

describe("normalizeMrz", () => {
  it("空白・小文字・全角をそろえる", () => {
    expect(normalizeMrz(" p<uto eriksson ")).toBe("P<UTOERIKSSON");
    expect(normalizeMrz("Ｌ８９８９０２Ｃ３")).toBe("L898902C3");
  });

  it("« のような化けた区切りも < として扱う", () => {
    expect(normalizeMrz("P«UTO")).toBe("P<UTO");
  });
});

describe("splitMrzLines", () => {
  it("改行があれば2行として読む", () => {
    expect(splitMrzLines(SAMPLE)).toEqual([LINE1, LINE2]);
  });

  it("改行が無くても88文字なら半分に割る", () => {
    expect(splitMrzLines(LINE1 + LINE2)).toEqual([LINE1, LINE2]);
  });
});

describe("parseMrzName", () => {
  it("姓と名に分け、< は空白として整形する", () => {
    expect(parseMrzName("ERIKSSON<<ANNA<MARIA<<<<<<<")).toEqual({
      surname: "ERIKSSON",
      givenNames: "ANNA MARIA",
    });
  });

  it("名が無くても姓だけ読む", () => {
    expect(parseMrzName("NGUYEN<<<<<<<<")).toEqual({ surname: "NGUYEN", givenNames: "" });
  });

  it("姓が複数語でも空白でつなぐ", () => {
    expect(parseMrzName("VAN<DER<BERG<<JAN")).toEqual({
      surname: "VAN DER BERG",
      givenNames: "JAN",
    });
  });
});

describe("mrzDate", () => {
  it("生年月日は未来にならない世紀にする", () => {
    expect(mrzDate("740812", "birth", TODAY)).toBe("1974-08-12");
    expect(mrzDate("050301", "birth", TODAY)).toBe("2005-03-01");
  });

  it("有効期限は2000年代として読む（期限切れでも同じ）", () => {
    expect(mrzDate("301231", "expiry", TODAY)).toBe("2030-12-31");
    expect(mrzDate("120415", "expiry", TODAY)).toBe("2012-04-15");
  });

  it("有効期限が先すぎる年になるときだけ1900年代にする", () => {
    // 2098年まで有効なパスポートは無いので1998年と読む
    expect(mrzDate("981231", "expiry", TODAY)).toBe("1998-12-31");
  });

  it("日付として成り立たないものは空にする", () => {
    expect(mrzDate("741332", "birth", TODAY)).toBe("");
    expect(mrzDate("<<<<<<", "birth", TODAY)).toBe("");
  });
});

describe("parseMrz（正常系）", () => {
  const r = parseMrz(SAMPLE, TODAY);

  it("形として読める", () => {
    expect(r.ok).toBe(true);
    expect(r.formatError).toBeNull();
  });

  it("チェックディジットがすべて合う", () => {
    expect(r.checks).toEqual({
      passportNo: true,
      birth: true,
      expiry: true,
      composite: true,
    });
    expect(r.invalidChecks).toEqual([]);
  });

  it("正規化した2行をそのまま返す（画面に残してコピーできるように）", () => {
    expect(r.line1).toBe(LINE1);
    expect(r.line2).toBe(LINE2);
  });

  it("各項目を取り出す", () => {
    expect(r.passportNo).toBe("L898902C3");
    expect(r.surname).toBe("ERIKSSON");
    expect(r.givenNames).toBe("ANNA MARIA");
    expect(r.birth).toBe("1974-08-12");
    expect(r.sex).toBe("女");
    expect(r.expiry).toBe("2012-04-15");
    expect(r.nationalityCode).toBe("UTO");
  });

  it("対応表に無い国コードは国籍を空にする（推測しない）", () => {
    expect(r.nationality).toBe("");
  });
});

describe("parseMrz（チェックディジット不正）", () => {
  it("生年月日のチェックディジットが違うと分かる", () => {
    const broken = `${LINE1}\n${LINE2.slice(0, 19)}9${LINE2.slice(20)}`;
    const r = parseMrz(broken, TODAY);
    expect(r.ok).toBe(true); // 形は読める
    expect(r.checks.birth).toBe(false);
    expect(r.invalidChecks).toContain("生年月日");
    // 読み取り自体は返す（画面で確認してもらう）
    expect(r.birth).toBe("1974-08-12");
  });

  it("パスポート番号を1文字変えると番号と全体のチェックが崩れる", () => {
    const broken = `${LINE1}\nX${LINE2.slice(1)}`;
    const r = parseMrz(broken, TODAY);
    expect(r.checks.passportNo).toBe(false);
    expect(r.checks.composite).toBe(false);
    expect(r.invalidChecks).toEqual(["パスポート番号", "全体"]);
  });
});

describe("parseMrz（形が違う）", () => {
  it("1行しかなければ読まない", () => {
    const r = parseMrz(LINE1, TODAY);
    expect(r.ok).toBe(false);
    expect(r.formatError).toContain("2行");
    expect(r.passportNo).toBe("");
  });

  it("44文字でなければ読まない", () => {
    const r = parseMrz("P<UTOERIKSSON\nL898902C3", TODAY);
    expect(r.ok).toBe(false);
    expect(r.formatError).toContain("44文字");
  });
});

describe("mrzToWorkerFields", () => {
  it("氏名は「姓 名」の並びにし、読めた項目だけ入れる", () => {
    const fields = mrzToWorkerFields(parseMrz(SAMPLE, TODAY));
    expect(fields).toEqual({
      name: "ERIKSSON ANNA MARIA",
      passport_no: "L898902C3",
      birth: "1974-08-12",
      gender: "女",
      passport_expiry_date: "2012-04-15",
      // MRZの2行も保存する（外国人詳細のコピー候補をいつでも出せるように。0095）
      passport_mrz: SAMPLE,
    });
    // 国籍は対応表に無いので入れない
    expect(fields.nationality).toBeUndefined();
  });

  it("対応表にある国コードなら日本語の国籍を入れる", () => {
    const vnm = `${LINE1}\n${LINE2.slice(0, 10)}VNM${LINE2.slice(13)}`;
    const fields = mrzToWorkerFields(parseMrz(vnm, TODAY));
    expect(fields.nationality).toBe("ベトナム");
  });

  it("読めなかった項目は入れない", () => {
    const noSex = `${LINE1}\n${LINE2.slice(0, 20)}<${LINE2.slice(21)}`;
    const fields = mrzToWorkerFields(parseMrz(noSex, TODAY));
    expect(fields.gender).toBeUndefined();
  });
});

describe("mrzCopyItems", () => {
  it("2行と読み取れた項目をコピーの選択肢に出す", () => {
    const items = mrzCopyItems(parseMrz(SAMPLE, TODAY));
    expect(items.map((i) => i.label)).toEqual([
      "MRZ 1行目",
      "MRZ 2行目",
      "パスポート番号",
      "姓（Surname）",
      "名（Given names）",
      "氏名（姓 名）",
      "生年月日",
      "性別",
      "有効期限",
      "国籍コード",
    ]);
    // 対応表に無い国コードなので「国籍」は出さない（空の項目は並べない）
    expect(items.find((i) => i.label === "国籍")).toBeUndefined();
  });

  it("MRZの行と番号・日付は等幅で出す", () => {
    const items = mrzCopyItems(parseMrz(SAMPLE, TODAY));
    const mono = items.filter((i) => i.mono).map((i) => i.label);
    expect(mono).toContain("MRZ 1行目");
    expect(mono).toContain("MRZ 2行目");
    expect(mono).toContain("パスポート番号");
    expect(mono).not.toContain("姓（Surname）");
  });

  it("行の中身は貼り付けた形そのまま（44文字）", () => {
    const items = mrzCopyItems(parseMrz(SAMPLE, TODAY));
    expect(items[0].value).toBe(LINE1);
    expect(items[1].value).toBe(LINE2);
    expect(items[0].value).toHaveLength(44);
  });

  it("形として読めなかったときは何も出さない", () => {
    expect(mrzCopyItems(parseMrz(LINE1, TODAY))).toEqual([]);
  });

  it("チェックディジットが合わなくてもコピーはできる（転記のために出す）", () => {
    const broken = `${LINE1}\n${LINE2.slice(0, 19)}9${LINE2.slice(20)}`;
    const items = mrzCopyItems(parseMrz(broken, TODAY));
    expect(items.find((i) => i.label === "生年月日")?.value).toBe("1974-08-12");
  });
});
