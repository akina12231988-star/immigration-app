import { describe, expect, it } from "vitest";
import {
  addressHead,
  buildPdfCheckItems,
  checkItem,
  checkPdfText,
  datesAfterLabel,
  findDates,
  findResidenceCardNos,
  normalizeForMatch,
  pdfCheckHeadline,
  pdfCheckSummary,
  toHiragana,
} from "@/lib/pdf-doc-check";

const worker = {
  name: "NGUYEN VAN A",
  kana: "グエン バン アー",
  birth: "2001-05-03",
  residence_card_no: "AB12345678CD",
  nationality: "ベトナム",
  address: "熊本県熊本市東区小山3-8-87カームリーハウスB201",
};

const org = {
  name: "株式会社サンライズ工業",
  address: "熊本県八代市本町1-1-1",
  tel: "0965-00-0000",
  representative: "山田 太郎",
};

describe("文字の正規化", () => {
  it("全角・空白・記号の違いを吸収する", () => {
    expect(normalizeForMatch("ＮＧＵＹＥＮ　ＶＡＮ　Ａ")).toBe("NGUYENVANA");
    expect(normalizeForMatch("熊本県 熊本市 東区")).toBe("熊本県熊本市東区");
  });

  it("カタカナはひらがなにそろえる（フリガナの照合用）", () => {
    expect(toHiragana("グエン")).toBe("ぐえん");
  });
});

describe("findDates", () => {
  it("西暦・令和・平成・区切り記号のどれでも読む", () => {
    expect(findDates("2001年5月3日")).toContain("2001-05-03");
    expect(findDates("平成13年5月3日")).toContain("2001-05-03");
    expect(findDates("令和7年1月1日")).toContain("2025-01-01");
    expect(findDates("令和元年5月1日")).toContain("2019-05-01");
    expect(findDates("2001/5/3")).toContain("2001-05-03");
    expect(findDates("２００１年５月３日")).toContain("2001-05-03");
  });

  it("日付でないものは拾わない", () => {
    expect(findDates("金額 1,710,036円")).toEqual([]);
  });
});

describe("findResidenceCardNos", () => {
  it("在留カード番号の形の文字列を取り出す", () => {
    expect(findResidenceCardNos("在留カード番号 AB12345678CD")).toEqual(["AB12345678CD"]);
    expect(findResidenceCardNos("番号なし")).toEqual([]);
  });
});

describe("datesAfterLabel", () => {
  it("「生年月日」の欄に書かれた日付だけを取り出す", () => {
    const text = "発行日 令和7年9月1日 氏名 グエン 生年月日 2001年5月3日";
    expect(datesAfterLabel(text, ["生年月日"])).toEqual(["2001-05-03"]);
  });
});

describe("addressHead", () => {
  it("市区町村までで見る（番地以降は書き方が割れるため）", () => {
    // 都道府県が省かれた書類でも合うように、都道府県は落として市区町村だけで見る
    expect(addressHead("熊本県熊本市東区小山3-8-87")).toBe("熊本市東区");
    expect(addressHead("北海道勇払郡安平町早来富岡224番地1")).toBe("勇払郡安平町");
    expect(addressHead("熊本県八代市本町1-1-1")).toBe("八代市");
  });
});

describe("checkItem", () => {
  const items = buildPdfCheckItems(worker, org);
  const item = (key: string) => items.find((i) => i.key === key)!;

  it("書いてあれば一致にする（空白・全角の違いは吸収する）", () => {
    expect(checkItem(item("name"), "氏名 ＮＧＵＹＥＮ　ＶＡＮ　Ａ 殿").status).toBe("found");
    expect(checkItem(item("kana"), "フリガナ ぐえん ばん あー").status).toBe("found");
    expect(checkItem(item("nationality"), "国籍・地域 ベトナム").status).toBe("found");
    expect(checkItem(item("address"), "住所 熊本県熊本市東区小山3丁目8-87").status).toBe("found");
    // 都道府県が書かれていない書類でも一致にする
    expect(checkItem(item("address"), "住所 熊本市東区小山3-8-87").status).toBe("found");
  });

  it("姓名の順が入れ替わっていても氏名は一致にする", () => {
    expect(checkItem(item("name"), "A NGUYEN VAN").status).toBe("found");
  });

  it("生年月日は書き方が違っても一致にする", () => {
    expect(checkItem(item("birth"), "生年月日 平成13年5月3日").status).toBe("found");
  });

  it("生年月日の欄に別の日付があれば「違う値」にする", () => {
    const r = checkItem(item("birth"), "氏名 別人 生年月日 1995年4月1日");
    expect(r.status).toBe("different");
    expect(r.found).toEqual(["1995-04-01"]);
  });

  it("発行日などの日付しかないときは「違う値」にしない（見つからない）", () => {
    expect(checkItem(item("birth"), "発行日 令和7年9月1日").status).toBe("missing");
  });

  it("在留カード番号は、別の番号が書いてあれば「違う値」にする", () => {
    const r = checkItem(item("card"), "在留カード番号 ZZ99999999YY");
    expect(r.status).toBe("different");
    expect(r.found).toEqual(["ZZ99999999YY"]);
    expect(checkItem(item("card"), "番号の記載なし").status).toBe("missing");
  });

  it("所属機関の名称・電話番号も見る", () => {
    expect(checkItem(item("orgName"), "勤務先 株式会社サンライズ工業").status).toBe("found");
    expect(checkItem(item("orgTel"), "電話 0965-00-0000").status).toBe("found");
  });
});

describe("buildPdfCheckItems", () => {
  it("登録されていない項目は照合しない", () => {
    const items = buildPdfCheckItems({ name: "あさひ" }, null);
    expect(items.map((i) => i.key)).toEqual(["name"]);
  });

  it("所属機関を渡すと、その項目も足す", () => {
    const keys = buildPdfCheckItems(worker, org).map((i) => i.key);
    expect(keys).toContain("orgName");
    expect(keys).toContain("orgRep");
  });
});

describe("まとめ", () => {
  const items = buildPdfCheckItems(worker, org);

  it("本人の書類なら、食い違いなしと出す", () => {
    const text =
      "課税証明書 氏名 NGUYEN VAN A 生年月日 2001年5月3日 住所 熊本県熊本市東区小山3-8-87 勤務先 株式会社サンライズ工業";
    const s = pdfCheckSummary(checkPdfText(items, text));
    expect(s.different).toBe(0);
    expect(s.missingImportant).toBe(0);
    expect(pdfCheckHeadline(s)).toContain("食い違うところは見つかりませんでした");
  });

  it("別人の書類なら、違う値と本人の情報が無いことを出す", () => {
    const text = "課税証明書 氏名 TRAN THI B 生年月日 1995年4月1日 在留カード番号 ZZ99999999YY";
    const s = pdfCheckSummary(checkPdfText(items, text));
    expect(s.different).toBeGreaterThan(0);
    expect(s.missingImportant).toBeGreaterThan(0);
    expect(pdfCheckHeadline(s)).toContain("違う値");
  });
});
