import { describe, expect, it } from "vitest";
import {
  buildResignationEntry,
  buildSalesEntries,
  daysInMonth,
  guessAppKind,
  monthEnd,
  nextMonthStart,
  prorateFromDate,
  prorateToDate,
  SSW_INSURANCE_AMOUNT,
  SSW_RENEWAL_SALES_ITEM,
  REFERRAL_SALES_ITEMS,
  REFERRAL_SALES_KEY,
  SSW_NEW_COMMON_ITEMS,
  defaultSalesItems,
  hasCustomSalesItems,
  isSswNewDiscountOrg,
  sswNewSalesItems,
  referralFeeFor,
  referralSalesItemFor,
  salesItemsForKind,
  supportFeeName,
  supportItemName,
  taxBreakdownMatches,
  taxFromExcl,
} from "./sales";

describe("日割り計算", () => {
  it("その月の日数を返す", () => {
    expect(daysInMonth("2026-04-08")).toBe(30);
    expect(daysInMonth("2026-08-09")).toBe(31);
    expect(daysInMonth("2024-02-01")).toBe(29); // うるう年
  });

  it("許可日からその月末まで（当日含む・小数点以下切り捨て）", () => {
    // 4月8日許可・月額20,000円 → 1日あたり 20000÷30 = 666（切り捨て）× 23日分 = 15,318
    expect(prorateFromDate(20000, "2026-04-08")).toEqual({
      amount: 15318,
      monthly: 20000,
      daily: 666,
      days: 23,
      monthDays: 30,
    });
    // 月初の許可なら満額
    expect(prorateFromDate(20000, "2026-04-01")?.amount).toBe(20000);
    // 月末の許可は1日分
    expect(prorateFromDate(20000, "2026-04-30")?.amount).toBe(666);
  });

  it("月初から退職日まで（当日含む・小数点以下切り捨て）", () => {
    // 8月9日退職・月額20,000円 → 1日あたり 20000÷31 = 645（切り捨て）× 9日分 = 5,805
    expect(prorateToDate(20000, "2026-08-09")).toEqual({
      amount: 5805,
      monthly: 20000,
      daily: 645,
      days: 9,
      monthDays: 31,
    });
    expect(prorateToDate(20000, "2026-08-31")?.amount).toBe(20000);
  });

  it("金額・日付が不正なら null", () => {
    expect(prorateFromDate(0, "2026-04-08")).toBeNull();
    expect(prorateToDate(20000, "")).toBeNull();
  });
});

describe("名称の切り替え", () => {
  it("特定活動はサポート代、特定技能は支援代", () => {
    expect(supportFeeName("特定技能申請")).toBe("支援代");
    expect(supportFeeName("特定技能更新申請")).toBe("支援代");
    expect(supportFeeName("特定活動申請")).toBe("サポート代");
    expect(supportFeeName("特定活動更新申請")).toBe("サポート代");
    expect(supportItemName("特定活動申請")).toBe("特定活動サポート代");
    expect(supportItemName("特定技能申請")).toBe("特定技能支援代");
  });
});

describe("月の境界", () => {
  it("月末・翌月1日を返す", () => {
    expect(monthEnd("2026-04-08")).toBe("2026-04-30");
    expect(nextMonthStart("2026-04-08")).toBe("2026-05-01");
    expect(nextMonthStart("2026-12-20")).toBe("2027-01-01");
  });
});

describe("buildSalesEntries", () => {
  const base = {
    workerName: "BOY SAMNANG",
    permitDate: "2026-04-08",
    supportFee: "20,000円/人",
    applicationItems: [{ name: "特定技能申請", amount: "150,000円" }],
  };

  it("特定技能申請・保険が会社負担: 申請・保険・日割り・定期売上の4件", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定技能申請",
      insuranceByCompany: true,
    });
    expect(entries.map((e) => e.kind)).toEqual(["申請", "保険", "支援代日割り", "定期売上"]);

    expect(entries[0]).toMatchObject({
      item_name: "特定技能申請",
      description: "BOY SAMNANGさん　特定技能申請",
      amount: 150000,
      taxable: true,
    });

    // 特定技能総合保険は1人あたり8,820円・非課税
    expect(entries[1]).toMatchObject({
      item_name: "特定技能総合保険",
      amount: SSW_INSURANCE_AMOUNT,
      taxable: false,
    });

    // 「〇〇さん　4月8日からの特定技能支援代」
    expect(entries[2].description).toBe("BOY SAMNANGさん　4月8日からの特定技能支援代");
    expect(entries[2].amount).toBe(15318);
    expect(entries[2]).toMatchObject({ period_from: "2026-04-08", period_to: "2026-04-30" });

    // 定期売上は翌月1日から（終了日は退職時に締める）
    expect(entries[3]).toMatchObject({
      kind: "定期売上",
      amount: 20000,
      period_from: "2026-05-01",
      period_to: null,
    });
  });

  it("保険が外国人負担なら保険の明細を作らない", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定技能申請",
      insuranceByCompany: false,
    });
    expect(entries.map((e) => e.kind)).toEqual(["申請", "支援代日割り", "定期売上"]);
  });

  it("更新申請は会社負担でも保険を作らない（新規のみ）", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定技能更新申請",
      insuranceByCompany: true,
    });
    expect(entries.some((e) => e.kind === "保険")).toBe(false);
  });

  it("特定活動はサポート代の名称になる", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定活動申請",
      insuranceByCompany: true,
    });
    expect(entries.some((e) => e.kind === "保険")).toBe(false); // 特定技能申請ではない
    const prorated = entries.find((e) => e.kind === "支援代日割り");
    expect(prorated?.description).toBe("BOY SAMNANGさん　4月8日からの特定活動サポート代");
    expect(prorated?.item_name).toBe("特定活動サポート代");
    expect(entries.find((e) => e.kind === "定期売上")?.description).toContain("サポート代");
  });
});

describe("buildResignationEntry", () => {
  it("退職日までの日割り明細を作る", () => {
    const entry = buildResignationEntry({
      workerName: "BOY SAMNANG",
      appKind: "特定技能申請",
      leavingOn: "2026-08-09",
      supportFee: "20,000円/人",
    });
    expect(entry).toMatchObject({
      kind: "退職精算",
      item_name: "特定技能支援代",
      description: "BOY SAMNANGさん　8月9日までの特定技能支援代",
      amount: 5805,
      period_from: "2026-08-01",
      period_to: "2026-08-09",
    });
  });

  it("支援代が未設定なら作らない", () => {
    expect(
      buildResignationEntry({
        workerName: "A",
        appKind: "特定技能申請",
        leavingOn: "2026-08-09",
        supportFee: "",
      }),
    ).toBeNull();
  });
});

describe("guessAppKind", () => {
  it("在留資格・申請内容から申請種別を推定する", () => {
    expect(guessAppKind("特定技能1号", "在留資格変更許可申請")).toBe("特定技能申請");
    expect(guessAppKind("特定技能1号", "在留期間更新許可申請")).toBe("特定技能更新申請");
    expect(guessAppKind("特定活動（特定技能1号移行準備）", "変更")).toBe("特定活動申請");
    expect(guessAppKind("特定活動", "更新")).toBe("特定活動更新申請");
  });
});

describe("buildSalesEntries: 特定活動→特定技能の移行（fullMonthSupport）", () => {
  const base = {
    workerName: "CHU THI SAM",
    permitDate: "2026-07-17",
    supportFee: "10,000円",
    applicationItems: [{ name: "特定技能申請", amount: "100,000円" }],
  };

  it("許可月は日割りせず満額（品目は特定技能支援代・期間は月初〜月末）", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定技能申請",
      insuranceByCompany: false,
      fullMonthSupport: true,
    });
    const kinds = entries.map((e) => e.kind);
    expect(kinds).not.toContain("支援代日割り");
    const full = entries.find((e) => e.kind === "支援代満額");
    expect(full).toBeDefined();
    expect(full?.item_name).toBe("特定技能支援代");
    expect(full?.amount).toBe(10000); // 満額（日割りしない）
    expect(full?.period_from).toBe("2026-07-01");
    expect(full?.period_to).toBe("2026-07-31");
    expect(full?.description).toContain("7月分の特定技能支援代");
    expect(full?.description).toContain("満額");
    // 定期売上は通常どおり翌月から
    const recurring = entries.find((e) => e.kind === "定期売上");
    expect(recurring?.period_from).toBe("2026-08-01");
    expect(recurring?.amount).toBe(10000);
  });

  it("fullMonthSupport なしなら従来どおり許可日から日割り", () => {
    const entries = buildSalesEntries({
      ...base,
      appKind: "特定技能申請",
      insuranceByCompany: false,
    });
    const prorated = entries.find((e) => e.kind === "支援代日割り");
    // 1日あたり 10000÷31 = 322（切り捨て）× 7/17〜7/31 の15日分 = 4,830
    expect(prorated?.amount).toBe(4830);
    expect(prorated?.period_from).toBe("2026-07-17");
    expect(prorated?.period_to).toBe("2026-07-31");
    expect(entries.some((e) => e.kind === "支援代満額")).toBe(false);
  });
});

describe("消費税（請求・入金の記録）", () => {
  it("税抜からの消費税は10%・1円未満切り捨て", () => {
    expect(taxFromExcl(50000)).toBe(5000);
    expect(taxFromExcl(81473)).toBe(8147); // 8147.3 → 切り捨て
    expect(taxFromExcl(0)).toBe(0);
    expect(taxFromExcl(-100)).toBe(0);
  });

  it("税抜＋消費税＋非課税が税込と合っているか判定する", () => {
    expect(taxBreakdownMatches(50000, 5000, 0, 55000)).toBe(true);
    expect(taxBreakdownMatches(50000, 5000, 0, 55001)).toBe(false);
    expect(taxBreakdownMatches(0, 0, 0, 0)).toBe(true);
    // 特定技能総合保険（非課税 8,820円）が混ざる月
    expect(taxBreakdownMatches(50000, 5000, 8820, 63820)).toBe(true);
    expect(taxBreakdownMatches(50000, 5000, 8820, 55000)).toBe(false);
  });
});

describe("申請種別ごとの売上明細の既定値と、所属機関ごとの変更", () => {
  it("変更していない機関は既定の明細（更新・特定活動は18,000円の1行）", () => {
    expect(SSW_RENEWAL_SALES_ITEM).toEqual({ name: "在留資格更新許可申請に係る申請取次支援業務費", amount: "18000" });
    for (const kind of ["特定技能更新申請", "特定活動申請", "特定活動更新申請"]) {
      expect(defaultSalesItems(kind)).toEqual([SSW_RENEWAL_SALES_ITEM]);
      expect(salesItemsForKind(null, kind)).toEqual([SSW_RENEWAL_SALES_ITEM]);
      // 古い登録が残っていても、変更した印（sales_items_custom）が無ければ既定を使う
      expect(salesItemsForKind({ sales_items: { [kind]: [{ name: "旧", amount: "30000" }] } }, kind)).toEqual([SSW_RENEWAL_SALES_ITEM]);
    }
    expect(defaultSalesItems("その他")).toEqual([]);
  });

  it("変更した機関（sales_items_custom に入っている種別）はその機関の明細を使う", () => {
    const src = {
      sales_items: { 特定技能更新申請: [{ name: "更新費用", amount: "20000" }, { name: "追加", amount: "1000" }] },
      sales_items_custom: ["特定技能更新申請"],
    };
    expect(hasCustomSalesItems(src, "特定技能更新申請")).toBe(true);
    expect(hasCustomSalesItems(src, "特定活動申請")).toBe(false);
    const items = salesItemsForKind(src, "特定技能更新申請");
    expect(items).toEqual(src.sales_items.特定技能更新申請);
    // コピーなので元を変えない
    items[0].amount = "0";
    expect(src.sales_items.特定技能更新申請[0].amount).toBe("20000");
    // 変更の印はあるが行が無い（全部削除した）ときは空
    expect(salesItemsForKind({ sales_items: {}, sales_items_custom: ["特定活動申請"] }, "特定活動申請")).toEqual([]);
  });

  it("特定技能申請（新規）の既定は所属機関名で申請取次支援業務費が決まり、共通の2行を足す", () => {
    expect(SSW_NEW_COMMON_ITEMS).toEqual([
      { name: "事前ガイダンス", amount: "5000" },
      { name: "生活オリエンテーション", amount: "12500" },
    ]);
    // 28,500円の3社（法人格の有無・異体字・空白の違いは同じ扱い）
    for (const name of ["有限会社國崎青果", "國崎青果", "（有）国崎青果", "BASE", "BASE株式会社", "株式会社 base", "西田祐一", "西田 祐一"]) {
      expect(isSswNewDiscountOrg(name), name).toBe(true);
    }
    for (const name of ["株式会社サンプル農園", "西田博幸", "BASEBALL株式会社", ""]) {
      expect(isSswNewDiscountOrg(name), name).toBe(false);
    }
    expect(sswNewSalesItems("有限会社國崎青果")).toEqual([
      { name: "在留資格変更許可申請に係る申請取次支援業務費", amount: "28500" },
      ...SSW_NEW_COMMON_ITEMS,
    ]);
    expect(sswNewSalesItems("株式会社サンプル農園")[0]).toEqual({ name: "在留資格変更許可申請に係る申請取次支援業務費", amount: "78500" });
    expect(salesItemsForKind({ sales_items: { 特定技能申請: [{ name: "申請取次費用", amount: "50000" }] } }, "特定技能申請", "BASE")).toEqual(sswNewSalesItems("BASE"));
    expect(salesItemsForKind({ sales_items: { 特定技能申請: [{ name: "申請取次費用", amount: "50000" }] }, sales_items_custom: ["特定技能申請"] }, "特定技能申請", "BASE")).toEqual([{ name: "申請取次費用", amount: "50000" }]);
  });

  it("あっせんの既定は国内30,000円・国外50,000円。台帳の初期値は国内・国外で選ぶ", () => {
    expect(REFERRAL_SALES_ITEMS).toEqual([
      { name: "人材紹介手数料代（国内）", amount: "30000" },
      { name: "人材紹介手数料（国外）", amount: "50000" },
    ]);
    expect(salesItemsForKind(null, REFERRAL_SALES_KEY)).toEqual(REFERRAL_SALES_ITEMS);
    expect(referralSalesItemFor(null, "国内").name).toBe("人材紹介手数料代（国内）");
    expect(referralSalesItemFor(undefined, "国外").name).toBe("人材紹介手数料（国外）");
    expect(referralFeeFor(null, "国内")).toBe(30000);
    expect(referralFeeFor(null, "国外")).toBe(50000);
    expect(referralFeeFor(null, "")).toBe(30000);
    // この機関だけの明細: 名前の「国内」「国外」で選び、無ければ順番（1行目=国内、2行目=国外）
    const named = { sales_items: { あっせん: [{ name: "紹介（国外）", amount: "60,000円" }, { name: "紹介（国内）", amount: "25000" }] }, sales_items_custom: ["あっせん"] };
    expect(referralFeeFor(named, "国内")).toBe(25000);
    expect(referralFeeFor(named, "国外")).toBe(60000);
    const ordered = { sales_items: { あっせん: [{ name: "紹介料A", amount: "11000" }, { name: "紹介料B", amount: "22000" }] }, sales_items_custom: ["あっせん"] };
    expect(referralFeeFor(ordered, "国内")).toBe(11000);
    expect(referralFeeFor(ordered, "国外")).toBe(22000);
    // 1行だけならどちらもその行
    const single = { sales_items: { あっせん: [{ name: "紹介料", amount: "33000" }] }, sales_items_custom: ["あっせん"] };
    expect(referralFeeFor(single, "国外")).toBe(33000);
  });
});
