import { describe, expect, it } from "vitest";
import { buildApplicationCopyGroups, type ApplicationCopyInput } from "./application-copy";
import {
  buildOnlineApplication,
  councilFreeText,
  digitsOnly,
  employmentStandardChoice,
  HOURS_NOTE,
  fieldSpecificChoice,
  hours4,
  industryFieldChoice,
  NEITHER,
  transferChoice,
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

  it("hours4 は4文字以内の整数にする（画面は小数点を受け付けない）", () => {
    expect(hours4("40.0")).toBe("40");
    expect(hours4("37.5")).toBe("37"); // 小数点以下は切り捨て
    expect(hours4("173.3")).toBe("173");
    expect(hours4("173.33")).toBe("173");
    expect(hours4("1733.33")).toBe("1733");
    // 「45時間08分」「45:08」は 4508 ではなく時間に直してから
    expect(hours4("45時間08分")).toBe("45");
    expect(hours4("45:08")).toBe("45");
    expect(hours4("40時間00分")).toBe("40");
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

  it("画面の順に8つの欄に分かれる", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "身分事項（1〜16）", "区分V（18〜28・職歴）", "取次者", "特定技能雇用契約（2.1〜2.42）", "特定技能所属機関（3.1〜3.43）", "1号特定技能外国人支援計画（4.1〜4.16）", "登録支援機関（5.1〜5.16）", "受領方法等・フリー欄",
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

  it("犯罪歴・在日親族・評価区分は外国人の登録値から出す", () => {
    expect(get("犯罪を理由とする処分を受けたことの有無")).toMatchObject({ no: "15", value: "無" });
    expect(get("在日親族及び同居者 有無")).toMatchObject({ no: "16.1", value: "" });
    const w2 = {
      ...worker,
      criminal_record: "有",
      criminal_record_note: "2020年 交通違反の罰金",
      relatives_in_japan: "有",
      relatives: [{ name: "Nguyen Van A", birth: "1990-01-02", workplace: "株式会社テスト", residence_card_no: "ab12 345678cd" }],
      skill_eval_kind: "技能検定",
      japanese_eval_kind: "技能実習２号を良好に修了",
    };
    const s2 = buildOnlineApplication({ ...input, worker: w2 }, buildApplicationCopyGroups({ ...input, worker: w2 }));
    const all2 = s2.flatMap((s) => s.items);
    const g2 = (label: string) => all2.find((i) => i.label === label);
    expect(g2("犯罪を理由とする処分を受けたことの有無")?.value).toBe("有");
    expect(g2("処分の内容")?.value).toBe("2020年 交通違反の罰金");
    expect(g2("在日親族及び同居者 有無")?.value).toBe("有");
    expect(g2("氏名")?.value).toBe("NGUYEN THI HONG");
    expect(all2.filter((i) => i.no === "16.3")[0]?.value).toBe("NGUYEN VAN A");
    expect(all2.filter((i) => i.no === "16.4")[0]?.value).toBe("19900102");
    expect(all2.filter((i) => i.no === "16.8")[0]?.value).toBe("AB12345678CD");
    expect(g2("技能水準 評価区分")?.value).toBe("技能検定");
    expect(g2("日本語能力 評価区分")?.value).toBe("技能実習２号を良好に修了");
  });

  it("22〜27 は運用どおりの選び方、2.3 は分野のプルダウン表記、取次者は申請準備の申請取次士", () => {
    expect(get("保証金の徴収・財産管理・違約金等の支払契約の有無")?.value).toBe("無");
    expect(get("外国の機関への費用支払について合意していることの有無")?.value).toBe(NEITHER);
    expect(get("国籍国等で定められる手続を経ていることの有無")?.value).toBe(NEITHER);
    expect(get("本邦で定期的に負担する費用について合意していることの有無")?.value).toBe("有");
    expect(get("技能実習で修得した技能等の本国への移転に努めることの有無")?.value).toBe(NEITHER); // 1号
    expect(transferChoice("特定技能2号")).toBe("有");
    expect(get("特定産業分野に特有の基準に適合していることの有無")?.value).toBe(NEITHER); // 農業
    expect(fieldSpecificChoice("介護")).toBe("有");
    expect(fieldSpecificChoice("造船・舶用工業／溶接")).toBe("有");
    expect(fieldSpecificChoice("農業分野")).toBe(NEITHER);
    expect(get("(2)従事すべき業務の内容 特定産業分野01")?.value).toBe("農業分野");
    // 2.5 主たる職種: 未登録ならその場で職種一覧から選んで保存（農業は農林漁業従事者が目安）。登録していればその値
    expect(get("(2)従事すべき業務の内容 職種 主たる職種")?.edit).toMatchObject({ target: "worker", column: "main_occupation" });
    expect(get("(2)従事すべき業務の内容 職種 主たる職種")?.note).toContain("農林漁業従事者");
    const s4 = buildOnlineApplication({ ...input, worker: { ...worker, main_occupation: "農林漁業従事者" } }, buildApplicationCopyGroups(input));
    expect(s4.flatMap((s) => s.items).find((i) => i.no === "2.5")?.value).toBe("農林漁業従事者");
    expect(industryFieldChoice("農業／畜産農業全般")).toBe("農業分野");
    expect(industryFieldChoice("")).toBe("");
    // 取次者: 申請準備の申請取次士を優先。無ければ登録支援機関の申請取次者
    expect(get("取次者(オンラインシステム利用者) (1)氏名")?.value).toBe("秋吉　伽恋");
    const s3 = buildOnlineApplication({ ...input, agentName: "野口 明菜" }, buildApplicationCopyGroups(input));
    expect(s3.flatMap((s) => s.items).find((i) => i.label === "取次者(オンラインシステム利用者) (1)氏名")?.value).toBe("野口　明菜");
  });

  it("2.7・2.8 所定労働時間は小数点以下を切り捨て、注意書きを出す", () => {
    const hrs = { ...input, intake: { ...intake, posting_weekly_hours: "45時間08分", posting_monthly_hours: "173.33" } };
    const items = buildOnlineApplication(hrs, buildApplicationCopyGroups(hrs)).flatMap((s) => s.items);
    expect(items.find((i) => i.no === "2.7")).toMatchObject({ value: "45", note: HOURS_NOTE });
    expect(items.find((i) => i.no === "2.8")).toMatchObject({ value: "173", note: HOURS_NOTE });
    expect(HOURS_NOTE).toContain("小数点以下は入力できない");
  });

  it("2.9〜2.20 は運用どおりの値、2.21〜2.29 は記載しない、2.17 は分野で決まる", () => {
    expect(get("(3)所定労働時間が通常の労働者と同等であることの有無")?.value).toBe("有");
    expect(get("(4)報酬の額が日本人と同等以上であることの有無")?.value).toBe("有");
    expect(get("(6)外国人であることを理由に異なった待遇としている事項の有無")?.value).toBe("無");
    expect(get("(7)一時帰国を希望した場合に有給休暇を取得させることの有無")?.value).toBe("有");
    expect(get("(8)雇用関係につき告示で定められる基準に適合していることの有無")?.value).toBe(NEITHER); // 農業
    expect(employmentStandardChoice("飲食料品製造業")).toBe("有");
    expect(employmentStandardChoice("木材産業分野")).toBe("有");
    expect(employmentStandardChoice("介護")).toBe(NEITHER);
    expect(get("(9)帰国旅費を負担し必要な措置をすることの有無")?.value).toBe("有");
    expect(get("(10)健康・生活の状況を把握するための措置を講ずることの有無")?.value).toBe("有");
    expect(get("(11)特定産業分野に特有の基準に適合していることの有無")?.value).toBe(NEITHER);
    expect(get("(12)派遣先")).toMatchObject({ no: "2.21〜2.29", skip: true, value: "" });
    // 2.10/2.11 は申請準備中の所属機関の賃金（月給 → 時給換算）
    expect(get("(4)月額報酬")?.value).toBe("182070");
    const hoursIn = { ...input, intake: { ...intake, posting_annual_hours: "2080" } };
    const s6 = buildOnlineApplication(hoursIn, buildApplicationCopyGroups(hoursIn)).flatMap((s) => s.items);
    expect(s6.find((i) => i.no === "2.11")?.value).toBe(String(Math.round((182070 * 12) / 2080)));
    // 2.12 は所属機関の専従者の報酬（未登録ならその場で入力して所属機関に保存できる）
    expect(get("(4)同等の業務に従事する日本人の月額報酬")).toMatchObject({ no: "2.12", value: "", edit: { target: "staff", index: 0, field: "pay" } });
    const s5 = buildOnlineApplication(
      { ...input, intake: { ...intake, japanese_staff: [{ name: "山田", role: "", profile: "", pay: "月給250,000円" }] } },
      buildApplicationCopyGroups({ ...input, intake: { ...intake, japanese_staff: [{ name: "山田", role: "", profile: "", pay: "月給250,000円" }] } }),
    );
    expect(s5.flatMap((s) => s.items).find((i) => i.no === "2.12")?.value).toBe("250000");
  });

  it("職業紹介事業者はあっせんありのとき、取次機関は認定申請のときだけ入れる", () => {
    // あっせん未定: 値は出して案内する
    expect(get("(13)職業紹介事業者 氏名又は名称")?.value).toBe("ＶＵＯＮＧ　ＶＡＮ　ＴＨＡＮＨ");
    expect(get("(13)職業紹介事業者 雇用保険適用事業所番号")?.value).toBe("43016290222");
    expect(get("(14)取次機関")).toMatchObject({ no: "2.38〜2.42", skip: true });
    // あっせんなし: 記載しない
    const none = buildOnlineApplication({ ...input, assen: "なし" }, buildApplicationCopyGroups(input)).flatMap((s) => s.items);
    expect(none.find((i) => i.no === "2.30〜2.37")).toMatchObject({ skip: true });
    expect(none.find((i) => i.no === "2.32")).toBeUndefined();
    // あっせんあり: 2.30〜2.37 を出す（2.32 は登録支援機関の雇用保険適用事業所番号）
    const yes = buildOnlineApplication({ ...input, assen: "あり" }, buildApplicationCopyGroups(input)).flatMap((s) => s.items);
    expect(yes.find((i) => i.no === "2.32")?.value).toBe("43016290222");
    expect(yes.find((i) => i.no === "2.30〜2.37")).toBeUndefined();
    // 認定申請: 取次機関 2.38〜2.42 を外国人ごとに入力・保存できる（登録値はハイフン無しで出す）
    const nintei = buildOnlineApplication(
      { ...input, appType: "認定", worker: { ...worker, agency_name: "ABC Co., Ltd", agency_tel: "+84-24-1234-5678" } },
      buildApplicationCopyGroups(input),
    ).flatMap((s) => s.items);
    expect(nintei.find((i) => i.no === "2.38")).toMatchObject({ value: "ＡＢＣ　Ｃｏ.,　Ｌｔｄ", edit: { target: "worker", column: "agency_name" }, editValue: "ABC Co., Ltd" });
    expect(nintei.find((i) => i.no === "2.42")).toMatchObject({ value: "842412345678", edit: { target: "worker", column: "agency_tel" } });
    expect(nintei.find((i) => i.no === "2.38〜2.42")).toBeUndefined();
  });

  it("3.1〜3.43 は所属機関の情報から出て、その場で編集できる（番号はハイフン無しでコピー）", () => {
    expect(get("(3)雇用保険適用事業所番号")).toMatchObject({ no: "3.3", value: "43016290222", edit: { target: "intake", column: "koyo_no" }, editValue: "4301-629022-2" });
    expect(get("(4)業種 主たる業種")).toMatchObject({ no: "3.4", value: "", edit: { target: "org", column: "main_industry" } });
    expect(get("(4)業種 主たる業種")?.note).toContain("農林業");
    expect(get("(9)代表者の氏名")).toMatchObject({ value: "國崎　太郎", edit: { target: "intake", column: "rep_name" } });
    expect(get("特定技能所属機関 (1)氏名又は名称")?.edit).toMatchObject({ target: "org", column: "name" });
    const withRosai = buildOnlineApplication({ ...input, intake: { ...intake, rosai_no: "43-1-01-123456-000" } }, buildApplicationCopyGroups(input)).flatMap((s) => s.items);
    expect(withRosai.find((i) => i.no === "3.20")).toMatchObject({ value: "43101123456000", editValue: "43-1-01-123456-000" });
    // 労働保険番号が入っていれば 3.19 は「有」
    expect(withRosai.find((i) => i.no === "3.19")?.value).toBe("有");
    // 身分事項・登録支援機関もその場で保存できる
    expect(get("氏名")?.edit).toMatchObject({ target: "worker", column: "name" });
    expect(get("登録支援機関 (1)氏名又は名称")?.edit).toMatchObject({ target: "custodian", column: "officeName" });
    expect(onlineSectionText({ title: "t", items: [get("(12)派遣先")!] })).toBe("2.21〜2.29 (12)派遣先: （記載しない）");
  });

  it("3.21〜3.43・支援計画の委託・4.1〜4.16 は運用どおりの値（特定技能1号のときだけ有になるものがある）", () => {
    const by = (no: string) => all.find((i) => i.no === no);
    for (const no of ["3.21", "3.22", "3.23", "3.24", "3.25", "3.26", "3.27", "3.28", "3.29", "3.30", "3.32", "3.34", "3.35"]) {
      expect(by(no)?.value, no).toBe("無");
    }
    for (const no of ["3.33", "3.41", "3.42", "3.43"]) expect(by(no)?.value, no).toBe("有");
    for (const no of ["3.31", "3.37", "3.39"]) expect(by(no)?.value, no).toBe(NEITHER);
    expect(by("3.38")).toMatchObject({ skip: true });
    expect(get("(29)労災保険加入等の措置の有無")?.value).toBe("有");
    expect(get("(29)労災保険加入等の措置の内容")).toMatchObject({ no: "3.40", edit: { target: "intake", column: "rosai_measure" } });
    const rosai = buildOnlineApplication({ ...input, intake: { ...intake, rosai_covered: "はい" } }, buildApplicationCopyGroups({ ...input, intake: { ...intake, rosai_covered: "はい" } })).flatMap((s) => s.items);
    expect(rosai.find((i) => i.label === "(29)労災保険加入等の措置の内容")?.value).toBe("労災保険加入");
    // 特定技能1号: 3.36・委託・4.1〜4.15（4.14 以外）は「有」、4.14・4.16 はどちらも選ばない
    expect(by("3.36")?.value).toBe("有");
    expect(get("特定技能1号での在留を希望し登録支援機関に支援計画の全部の実施を委託することの有無")?.value).toBe("委託する");
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]) expect(by(`4.${n}`)?.value, `4.${n}`).toBe("有");
    expect(by("4.14")?.value).toBe(NEITHER);
    expect(by("4.16")?.value).toBe(NEITHER);
    // 特定技能2号: 3.36・4.1〜 はどちらも選ばない、委託もしない
    const s2 = buildOnlineApplication({ ...input, desiredStatus: "特定技能2号" }, buildApplicationCopyGroups(input)).flatMap((s) => s.items);
    expect(s2.find((i) => i.no === "3.36")?.value).toBe(NEITHER);
    expect(s2.find((i) => i.no === "4.1")?.value).toBe(NEITHER);
    expect(s2.find((i) => i.label.startsWith("特定技能1号での在留を希望し"))?.value).toBe(NEITHER);
  });

  it("登録支援機関・受領方法・フリー欄", () => {
    expect(get("(6)登録番号")?.value).toBe("２０登００５７４６"); // 記号「－」は入力できないので除く
    expect(get("(7)登録年月日")?.value).toBe("20210324");
    expect(get("(4)電話番号")?.value).toBe("05088904000");
    expect(get("申請対象者の住居地（都道府県）")?.value).toBe("熊本県");
    expect(get("フリー欄（協力確認書）")?.value).toContain("八代市長");
    // 通知送信用メールアドレスはオンラインシステムの利用者（取次者）のメール
    expect(get("通知送信用メールアドレス")?.value).toBe("thanhktc2017.visa@gmail.com");
  });

  it("在留カードの受領方法はこの場で選んで保存でき、窓口なら受領官署に熊本出張所が出る", () => {
    const method = get("在留カードの受領方法");
    expect(method?.value).toBe("");
    expect(method?.edit).toEqual({ target: "worker", column: "card_receipt_method", options: ["郵送", "窓口"] });
    // 未選択: 受領官署は画面で選ぶ（案内付き）
    expect(get("受領官署")).toMatchObject({ value: "", manual: true });
    const items = (w: Partial<typeof input.worker>) =>
      buildOnlineApplication({ ...input, worker: { ...input.worker, ...w } }, buildApplicationCopyGroups(input)).flatMap((s) => s.items);
    const counter = items({ card_receipt_method: "窓口" });
    expect(counter.find((i) => i.label === "在留カードの受領方法")?.value).toBe("窓口");
    expect(counter.find((i) => i.label === "受領官署")?.value).toBe("福岡出入国在留管理局 熊本出張所");
    const mail = items({ card_receipt_method: "郵送" });
    expect(mail.find((i) => i.label === "受領官署")).toMatchObject({ value: "", skip: true });
  });

  it("画面で選ぶ項目は値が空で案内が出る", () => {
    const i = get("在日親族及び同居者 有無");
    expect(i).toMatchObject({ no: "16.1", value: "" });
    expect(onlineSectionText(sections[0])).toContain("16.1 在日親族及び同居者 有無: 未登録");
    expect(onlineSectionText(sections[0])).toContain("2 生年月日: 19940710");
  });
});
