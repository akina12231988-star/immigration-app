import { describe, expect, it } from "vitest";
import { buildApplicationCopyGroups, type ApplicationCopyInput } from "./application-copy";
import {
  buildOnlineApplication,
  councilFreeText,
  digitsOnly,
  hours4,
  occupationOf,
  onlineSectionText,
  renewalReasonText,
  payMethodChoice,
  prefectureOf,
  residencePeriodChoice,
  toZenkaku,
  upperName,
  ym6,
} from "./online-application";
import { emptyOrganizationIntake } from "./organization-intake";
import type { WorkerWage } from "@/types/db";

describe("入力形式の変換", () => {
  it("digitsOnly は数字だけにする", () => {
    expect(digitsOnly("096-279-3534")).toBe("0962793534");
    expect(digitsOnly("1,100円")).toBe("1100");
    expect(digitsOnly("４３０１-６２９０２２-２")).toBe("43016290222");
    expect(digitsOnly(null)).toBe("");
  });

  it("toZenkaku は英数字・ハイフン・空白を全角にする", () => {
    expect(toZenkaku("熊本県八代市郡築三番町175番地2")).toBe("熊本県八代市郡築三番町１７５番地２");
    expect(toZenkaku("20登-005746")).toBe("２０登－００５７４６");
    expect(toZenkaku("小山2丁目13-20 日産共同住宅201号")).toBe("小山２丁目１３－２０　日産共同住宅２０１号");
    expect(toZenkaku("")).toBe("");
  });

  it("upperName は半角大文字・空白1つ", () => {
    expect(upperName("Nguyen  Thi　Hong ")).toBe("NGUYEN THI HONG");
  });

  it("ym6 は年月を6桁にする", () => {
    expect(ym6("2022", "5")).toBe("202205");
    expect(ym6("2022-05-17")).toBe("202205");
    expect(ym6("", "5")).toBe("");
  });

  it("hours4 は4文字以内の数字にする", () => {
    expect(hours4("40.0")).toBe("40");
    expect(hours4("37.5")).toBe("37.5");
    expect(hours4("173.3")).toBe("173"); // 5文字になるので整数にする
    expect(hours4("173.33")).toBe("173");
    expect(hours4("1733.33")).toBe("1733");
    expect(hours4("")).toBe("");
  });

  it("prefectureOf は住所の都道府県", () => {
    expect(prefectureOf("熊本県阿蘇郡西原村大字布田1173番地２")).toBe("熊本県");
    expect(prefectureOf("東京都千代田区1-1-1")).toBe("東京都");
    expect(prefectureOf("北海道札幌市")).toBe("北海道");
    expect(prefectureOf("神奈川県横浜市")).toBe("神奈川県");
    expect(prefectureOf("")).toBe("");
  });

  it("residencePeriodChoice / payMethodChoice は画面の表記に寄せる", () => {
    expect(residencePeriodChoice("1年6か月")).toBe("1年6月");
    expect(payMethodChoice("通貨払い")).toBe("通貨払");
    expect(payMethodChoice("口座振込")).toBe("口座振込み");
    expect(payMethodChoice("")).toBe("");
  });

  it("councilFreeText は協力確認書の提出を文章にする", () => {
    expect(councilFreeText([{ to: "八代市", on: "2026-04-01" }], [])).toBe("１　有\n２（１）有、2026年4月1日提出、八代市長\n（２）無");
    expect(councilFreeText([], undefined)).toBe("１　無\n２（１）無\n（２）無");
  });
});

const worker = {
  name: "Nguyen Thi Hong",
  kana: "",
  nationality: "ベトナム",
  birth: "1994-07-10",
  gender: "女",
  has_spouse: "無",
  field: "農業",
  home_address: "THAI BINH - VIET NAM",
  address: "熊本県八代市郡築三番町175番地2",
  passport_no: "c2970924",
  passport_expiry_date: "2027-03-30",
  residence_status: "特定技能1号",
  residence_period: "1年",
  residence_permit_date: null,
  residence_expiry_date: "2026-10-13",
  residence_card_no: "AB12 345678CD",
  employment_start_on: "2024-05-15",
};
const org = { name: "有限会社國崎青果", industry: "農業", business_category: "耕種農業", address: "熊本県八代市郡築三番町175番地2", contact: "0965-37-0901", corporate_no: "1234567890123" };
const wage = (patch: Partial<WorkerWage>): WorkerWage => ({
  id: "w1", worker_id: "x", organization_id: null, kind: "月給", amount: 182070, started_on: "2024-05-15", reason: "採用時", note: "", detail: null, created_at: "2024-05-01", updated_at: "2024-05-01", ...patch,
});

describe("buildOnlineApplication", () => {
  const intake = { ...emptyOrganizationIntake(), pay_method: "口座振込", capital: "3,000,000円", koyo_no: "4301-629022-2", rep_name: "國崎 太郎", posting_weekly_hours: "40.0", council_office_submissions: [{ to: "八代市", on: "2026-04-01" }] };
  const input: ApplicationCopyInput = {
    worker, org, intake, wages: [wage({})],
    histories: [{ org: "荒木農園", start: "2017-11-01", end: "2021-07-31", status: "特定技能1号", counts: true } as never],
    planDates: { es: "2024-05-15" }, desiredStatus: "特定技能1号", today: "2025-05-01",
  };
  const sections = buildOnlineApplication(input, buildApplicationCopyGroups(input));
  const all = sections.flatMap((s) => s.items);
  const get = (label: string) => all.find((i) => i.label === label);

  it("画面の順に7つの欄に分かれる", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "身分事項（1〜16）", "区分V（18〜28・職歴）", "取次者", "特定技能雇用契約（2.1〜2.42）", "特定技能所属機関（3.1〜3.43）", "登録支援機関（5.1〜5.16）", "受領方法等・フリー欄",
    ]);
  });

  it("日付は8桁・氏名は大文字・住所は全角・番号は数字のみ", () => {
    expect(get("生年月日")).toMatchObject({ no: "2", value: "19940710", format: "date8" });
    expect(get("氏名")?.value).toBe("NGUYEN THI HONG");
    expect(get("日本における連絡先 住居地")?.value).toBe("熊本県八代市郡築三番町１７５番地２");
    expect(get("旅券 (1)番号")?.value).toBe("C2970924");
    expect(get("在留カード番号")?.value).toBe("AB12345678CD");
    expect(get("在留期間の満了日")?.value).toBe("20261013");
    expect(get("(5)電話番号")?.value).toBe("0965370901");
    expect(get("(2)法人番号")?.value).toBe("1234567890123");
    expect(get("(2)法人番号の有無")?.value).toBe("有");
    expect(get("(3)雇用保険適用事業所番号")?.value).toBe("43016290222");
    expect(get("(6)資本金")?.value).toBe("3000000");
  });

  it("雇用契約期間・報酬・支払方法・労働時間", () => {
    expect(get("特定技能雇用契約 (1)雇用契約期間(始期)")?.value).toBe("20240515");
    expect(get("特定技能雇用契約 (1)雇用契約期間(終期)")?.value).toBe("20260514");
    expect(get("(4)月額報酬")?.value).toBe("182070");
    expect(get("(5)報酬の支払方法")?.value).toBe("口座振込み");
    expect(get("(3)所定労働時間(週平均)")?.value).toBe("40");
  });

  it("職歴は6桁の年月で件数分", () => {
    expect(get("職歴の有無")?.value).toBe("有");
    expect(get("職歴 入社 年月01")?.value).toBe("201711");
    expect(get("職歴 退社 年月01")?.value).toBe("202107");
    expect(get("職歴 勤務先 名称01")?.value).toBe("荒木農園");
  });

  it("連絡先の電話番号は登録支援機関の番号、郵便番号は住所から検索する項目になる", () => {
    expect(get("日本における連絡先 電話番号")).toMatchObject({ no: "9.3", value: "05088904000", format: "digits" });
    expect(get("日本における連絡先 郵便番号")).toMatchObject({ no: "9.1", value: "", postalFor: "熊本県八代市郡築三番町175番地2", manual: false });
    expect(get("(5)住所（所在地） 郵便番号")?.postalFor).toBe("熊本県八代市郡築三番町175番地2");
    expect(get("(4)郵便番号")?.postalFor).toContain("熊本市東区小山3-8-87");
  });

  it("出生地・職業・携帯電話・メールアドレス・希望する在留資格と期間・理由", () => {
    expect(get("出生地")).toMatchObject({ no: "5", value: "ＴＨＡＩ　ＢＩＮＨ　－　ＶＩＥＴ　ＮＡＭ" });
    // 職業は職歴のいちばん新しい行の職種（この職歴は role が無いので分野・職種）
    expect(get("職業")?.value).toBe("農業");
    expect(get("日本における連絡先 携帯電話番号")?.value).toBe("記載なし");
    expect(get("メールアドレス（オンラインシステム利用者）")?.value).toBe("thanhktc2017.visa@gmail.com");
    expect(get("希望する在留資格")).toMatchObject({ no: "13.1", value: "特定技能1号" });
    expect(get("希望する在留期間")).toMatchObject({ no: "13.2", value: "1年" });
    expect(get("更新（変更）の理由")).toMatchObject({ no: "14", value: "1号特定技能外国人として就労するため" });
    expect(get("更新（変更）の理由")?.manual).toBeFalsy();
    expect(renewalReasonText("特定技能2号")).toBe("2号特定技能外国人として就労するため");
    expect(renewalReasonText("特定技能１号")).toBe("1号特定技能外国人として就労するため");
    expect(renewalReasonText("")).toBe("");
    expect(occupationOf([{ role: "惣菜製造" }, { role: " 農作業 " }], "農業")).toBe("農作業");
    expect(occupationOf([{ role: "" }], "農業")).toBe("農業");
  });

  it("登録支援機関・受領方法・フリー欄", () => {
    expect(get("(6)登録番号")?.value).toBe("２０登－００５７４６");
    expect(get("(7)登録年月日")?.value).toBe("20210324");
    expect(get("(4)電話番号")?.value).toBe("05088904000");
    expect(get("申請対象者の住居地（都道府県）")?.value).toBe("熊本県");
    expect(get("フリー欄（協力確認書）")?.value).toContain("八代市長");
  });

  it("画面で選ぶ項目は値が空で案内が出る", () => {
    const i = get("犯罪を理由とする処分を受けたことの有無");
    expect(i).toMatchObject({ no: "15", value: "", manual: true });
    expect(i?.note).toContain("通常は「無」");
    expect(onlineSectionText(sections[0])).toContain("15 犯罪を理由とする処分を受けたことの有無: （画面で入力）");
    expect(onlineSectionText(sections[0])).toContain("2 生年月日: 19940710");
  });
});
