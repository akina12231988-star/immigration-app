import { describe, expect, it } from "vitest";
import {
  addressHead,
  buildPdfCheckItems,
  buildPrepCheckItems,
  checkPdfPages,
  checkItem,
  checkPdfText,
  datesAfterLabel,
  findDates,
  findResidenceCardNos,
  normalizeForMatch,
  otherCorpNames,
  pdfCheckHeadline,
  pdfCheckSummary,
  splitCorpKind,
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

describe("会社の種類（法人格）", () => {
  it("種類と名前の部分に分ける", () => {
    expect(splitCorpKind("有限会社國崎青果")).toEqual({ kind: "有限会社", core: "國崎青果" });
    expect(splitCorpKind("サンライズ工業株式会社")).toEqual({ kind: "株式会社", core: "サンライズ工業" });
    expect(splitCorpKind("國崎青果")).toEqual({ kind: "", core: "國崎青果" });
  });

  it("名前は同じで種類だけ違う書き方を見つける", () => {
    expect(otherCorpNames("有限会社國崎青果", "特定技能所属機関 株式会社 國崎青果")).toEqual([
      "株式会社國崎青果",
    ]);
    expect(otherCorpNames("有限会社國崎青果", "特定技能所属機関 有限会社 國崎青果")).toEqual([]);
  });

  it("所属機関の名称は、種類だけ違えば「違う値」にする", () => {
    const item = buildPdfCheckItems({ name: "本人" }, { name: "有限会社國崎青果" }).find(
      (i) => i.key === "orgName",
    )!;
    expect(checkItem(item, "有限会社國崎青果").status).toBe("found");
    // 種類を書いていないだけなら、名前は合っているので一致にする
    expect(checkItem(item, "國崎青果 御中").status).toBe("found");
    const r = checkItem(item, "特定技能所属機関の氏名または名称 株式会社國崎青果");
    expect(r.status).toBe("different");
    expect(r.found).toEqual(["株式会社國崎青果"]);
  });
});

describe("buildPrepCheckItems（申請書に貼る情報から照合する項目を作る）", () => {
  it("必ず書かれているはずの値だけを、見つからないときの注意の対象にする", () => {
    const items = buildPrepCheckItems(
      [
        { label: "3 氏名", value: "SAN NAISORN" },
        { label: "2 生年月日", value: "2000年5月2日" },
        { label: "5 (1)氏名又は名称", value: "あっせん株式会社" },
      ],
      ["SAN NAISORN", "2000-05-02"],
    );
    expect(items.filter((i) => i.important).map((i) => i.label)).toEqual(["3 氏名", "2 生年月日"]);
  });

  it("短い値・計算した値・長い説明文は照合しない", () => {
    const items = buildPrepCheckItems([
      { label: "4 性別", value: "男" },
      { label: "6 配偶者の有無", value: "無" },
      { label: "21 申請時における特定技能1号での通算在留期間", value: "2年6か月" },
      { label: "28 職歴", value: "2017年11月〜2019年10月 前の会社" },
      { label: "1 国籍・地域", value: "カンボジア" },
    ]);
    expect(items.map((i) => i.label)).toEqual(["1 国籍・地域"]);
  });

  it("住所は市区町村までで見る", () => {
    const [item] = buildPrepCheckItems([
      { label: "9 住居地", value: "熊本県八代市新浜町2番1" },
    ]);
    expect(item.label).toBe("9 住居地（市区町村まで）");
    expect(item.value).toBe("八代市");
  });

  it("期間は日付ごとに分けて見る", () => {
    const items = buildPrepCheckItems([
      { label: "2 (1)雇用契約期間", value: "2026年9月19日 から 2028年9月18日 まで" },
    ]);
    expect(items.map((i) => i.value)).toEqual(["2026年9月19日", "2028年9月18日"]);
    // 生年月日以外の日付は「欄に別の日付がある」判定をしない（誤検知を避ける）
    expect(items.every((i) => i.labels?.length === 0)).toBe(true);
  });

  it("同じ値の項目は1回だけ照合する", () => {
    const items = buildPrepCheckItems([
      { label: "3 (1)氏名又は名称", value: "有限会社國崎青果" },
      { label: "3 (10)勤務させる事業所名", value: "有限会社國崎青果" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("orgName");
  });
});

describe("checkPdfPages（何ページもある書類一式）", () => {
  const items = buildPrepCheckItems([
    { label: "3 氏名", value: "SAN NAISORN" },
    { label: "17 特定技能所属機関 (1)氏名又は名称", value: "有限会社國崎青果" },
    { label: "12 在留カード番号", value: "AB12345678CD" },
  ]);
  const pages = [
    { label: "1ページ", text: "申請する特定技能外国人の名簿 株式会社國崎青果" },
    { label: "2ページ", text: "特定技能雇用契約書 特定技能所属機関 有限会社國崎青果 SAN NAISORN" },
  ];
  const by = (label: string) => checkPdfPages(items, pages).find((r) => r.label.includes(label))!;

  it("どれか1ページに書かれていれば一致にし、ページ番号を出す", () => {
    const r = by("氏名");
    expect(r.status).toBe("found");
    expect(r.where).toEqual(["2ページ"]);
  });

  it("他のページが合っていても、違う値のページがあれば知らせる", () => {
    const r = by("所属機関");
    expect(r.status).toBe("different");
    expect(r.found).toEqual(["株式会社國崎青果"]);
    expect(r.where).toEqual(["1ページ"]);
    expect(r.alsoFound).toEqual(["2ページ"]);
  });

  it("どこにも書かれていなければ、見つからないにする", () => {
    expect(by("在留カード番号").status).toBe("missing");
  });
});
