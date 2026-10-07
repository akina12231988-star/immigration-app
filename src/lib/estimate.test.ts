import { describe, expect, it } from "vitest";
import { CUSTODIAN_INFO } from "@/lib/custody";
import {
  buildEstimate,
  defaultStampFeeBandKey,
  estimateItemAmount,
  estimateQty,
  estimateTotals,
  withStampRow,
  PERIOD_UNDETERMINED_NOTE,
  residencePeriodMonths,
  salesKindOfPrep,
  stampFeeAmount,
  stampFeeApplies,
  stampFeeBandKeyOfPeriod,
  sswInsuranceIncluded,
  usesRevisedStampFee,
  type EstimateInput,
} from "./estimate";

const base: EstimateInput = {
  workerName: "NGUYEN VAN A",
  orgName: "株式会社サンプル農園",
  orgAddress: "869-4812 熊本県八代郡氷川町網道1440",
  orgRepName: "代表取締役 稲田 浩夫",
  appContent: "特定技能更新の準備中",
  appType: "更新",
  stampFeePayer: "会社負担",
  salesItems: [
    { name: "申請取次費用", amount: "50000" },
    { name: "書類作成費", amount: "30,000円" },
  ],
  supportFee: "10000",
  sswInsuranceBurden: "",
  todoNo: "1234",
  today: "2026-10-07",
  plannedAppOn: "2026-10-20",
  method: "窓口",
  bandKey: "1年",
  custodian: CUSTODIAN_INFO,
};

describe("在留期間 → 手数料の区分", () => {
  it("在留カードの在留期間の書き方を読んで区分を決める", () => {
    expect(residencePeriodMonths("1年")).toBe(12);
    expect(residencePeriodMonths("6月")).toBe(6);
    expect(residencePeriodMonths("1年3月")).toBe(15);
    expect(residencePeriodMonths("4か月")).toBe(4);
    expect(residencePeriodMonths("")).toBeNull();
    expect(stampFeeBandKeyOfPeriod("3月")).toBe("3月以下");
    expect(stampFeeBandKeyOfPeriod("4月")).toBe("3月超6月以下");
    expect(stampFeeBandKeyOfPeriod("6月")).toBe("3月超6月以下");
    expect(stampFeeBandKeyOfPeriod("8月")).toBe("6月超1年未満");
    expect(stampFeeBandKeyOfPeriod("1年")).toBe("1年");
    expect(stampFeeBandKeyOfPeriod("1年6月")).toBe("1年超3年未満");
    expect(stampFeeBandKeyOfPeriod("3年")).toBe("3年以上5年未満");
    expect(stampFeeBandKeyOfPeriod("5年")).toBe("5年以上");
    expect(stampFeeBandKeyOfPeriod("不明")).toBeNull();
  });

  it("改定後は区分と申請方法で金額が決まり、改定前は一律", () => {
    expect(stampFeeAmount("1年", "窓口", true)).toBe(33000);
    expect(stampFeeAmount("1年", "オンライン", true)).toBe(27000);
    expect(stampFeeAmount("5年以上", "窓口", true)).toBe(75000);
    expect(stampFeeAmount("1年", "窓口", false)).toBe(6000);
    expect(stampFeeAmount("1年", "オンライン", false)).toBe(5500);
  });

  it("2026年10月1日以降の受付（申請予定日。無ければ見積日）が改定後", () => {
    expect(usesRevisedStampFee("2026-09-30", "2026-10-07")).toBe(false);
    expect(usesRevisedStampFee("2026-10-01", "2026-10-07")).toBe(true);
    expect(usesRevisedStampFee(null, "2026-10-07")).toBe(true);
    expect(usesRevisedStampFee("", "2026-09-01")).toBe(false);
  });

  it("認定証明書の交付申請には手数料がかからない", () => {
    expect(stampFeeApplies("認定")).toBe(false);
    expect(stampFeeApplies("")).toBe(false);
    expect(stampFeeApplies("変更")).toBe(true);
    expect(stampFeeApplies("更新")).toBe(true);
    expect(stampFeeApplies("特定活動")).toBe(true);
  });
});

describe("許可の見込みの在留期間の初期値", () => {
  it("特定活動は3月超6月以下、特定技能への変更は1年、特定技能の更新は在留カードの期間", () => {
    expect(defaultStampFeeBandKey("特定活動で申請準備中", "特定活動", "1年")).toBe("3月超6月以下");
    expect(defaultStampFeeBandKey("特定活動（特定技能２号移行準備のため）準備中", "特定活動", "")).toBe("3月超6月以下");
    expect(defaultStampFeeBandKey("特定活動ビザ更新の申請準備", "更新", "1年")).toBe("3月超6月以下");
    expect(defaultStampFeeBandKey("特定技能申請準備中", "変更", "6月")).toBe("1年");
    expect(defaultStampFeeBandKey("特定技能2号申請準備中", "変更", "4月")).toBe("1年");
    expect(defaultStampFeeBandKey("特定技能更新の準備中", "更新", "1年")).toBe("1年");
    expect(defaultStampFeeBandKey("特定技能更新の準備中", "更新", "3年")).toBe("3年以上5年未満");
    expect(defaultStampFeeBandKey("特定技能更新の準備中", "更新", "")).toBe("1年");
    expect(defaultStampFeeBandKey("在留資格認定申請書の準備中", "認定", "")).toBe("1年");
  });

  it("印紙代を明細に入れたときは、在留期間が未定である注意を赤線付きで出す", () => {
    expect(buildEstimate(base).emphasizedNote).toBe(PERIOD_UNDETERMINED_NOTE);
    expect(buildEstimate({ ...base, stampFeePayer: "本人負担" }).emphasizedNote).toBeNull();
    expect(buildEstimate({ ...base, appContent: "在留資格認定申請書の準備中", appType: "認定" }).emphasizedNote).toBeNull();
    expect(buildEstimate({ ...base, plannedAppOn: "2026-09-25" }).emphasizedNote).toBeNull();
  });
});

describe("明細の編集（数量・金額・小計・印紙代の行の差し替え）", () => {
  it("数量の文字から数を読み、単価×数量で金額を出す", () => {
    expect(estimateQty("1式")).toBe(1);
    expect(estimateQty("2人")).toBe(2);
    expect(estimateQty("３件")).toBe(3);
    expect(estimateQty("式")).toBe(1);
    expect(estimateQty("0")).toBe(1);
    expect(estimateItemAmount({ unitPrice: 5000, qty: "2人" })).toBe(10000);
    expect(estimateItemAmount({ unitPrice: -1, qty: "1式" })).toBe(0);
  });

  it("小計・消費税・非課税・合計と、非課税の行の名前", () => {
    const t = estimateTotals([
      { name: "a", qty: "1式", unitPrice: 10000, amount: 10000, taxable: true, kind: "sales" },
      { name: "b", qty: "1件", unitPrice: 27000, amount: 27000, taxable: false, kind: "stamp" },
      { name: "c", qty: "1人", unitPrice: 8820, amount: 8820, taxable: false, kind: "insurance" },
      { name: "d", qty: "1式", unitPrice: 100, amount: 100, taxable: false, kind: "custom" },
    ]);
    expect(t).toEqual({ subtotalTaxable: 10000, tax: 1000, taxFree: 35920, taxFreeLabel: "収入印紙代・特定技能総合保険・その他", total: 46920 });
    expect(estimateTotals([]).taxFreeLabel).toBe("");
  });

  it("申請方法や在留期間を変えたら印紙代の行だけ差し替える（消していれば足さない）", () => {
    const first = buildEstimate(base);
    const edited = [{ ...first.items[0], name: "直した", kind: "custom" as const }, ...first.items.slice(1)];
    const rebuilt = buildEstimate({ ...base, method: "オンライン" });
    const next = withStampRow(edited, rebuilt);
    expect(next[0].name).toBe("直した");
    expect(next.find((i) => i.kind === "stamp")?.amount).toBe(27000);
    const without = edited.filter((i) => i.kind !== "stamp");
    expect(withStampRow(without, rebuilt).some((i) => i.kind === "stamp")).toBe(false);
  });
});

describe("準備の内容 → 売上明細の申請種別", () => {
  it("認定・特定技能の変更・2号は特定技能申請、更新は更新申請、特定活動は特定活動申請", () => {
    expect(salesKindOfPrep("在留資格認定申請書の準備中", "認定")).toBe("特定技能申請");
    expect(salesKindOfPrep("特定技能申請準備中", "変更")).toBe("特定技能申請");
    expect(salesKindOfPrep("特定技能2号申請準備中", "変更")).toBe("特定技能申請");
    expect(salesKindOfPrep("特定技能更新の準備中", "更新")).toBe("特定技能更新申請");
    expect(salesKindOfPrep("特定活動で申請準備中", "特定活動")).toBe("特定活動申請");
    expect(salesKindOfPrep("特定活動（特定技能２号移行準備のため）準備中", "特定活動")).toBe("特定活動申請");
    expect(salesKindOfPrep("特定活動ビザ更新の申請準備", "更新")).toBe("特定活動更新申請");
    // 0121より前の申請種別だけのデータ
    expect(salesKindOfPrep("", "特定活動")).toBe("特定活動申請");
    expect(salesKindOfPrep("", "更新")).toBe("特定技能更新申請");
  });
});

describe("見積書の組み立て", () => {
  it("会社負担: 売上明細＋収入印紙代（非課税）。消費税は課税分だけ", () => {
    const e = buildEstimate(base);
    expect(e.items.map((i) => [i.name, i.amount, i.taxable])).toEqual([
      ["申請取次費用", 50000, true],
      ["書類作成費", 30000, true],
      ["収入印紙代（申請手数料・窓口申請。在留期間「1年」で許可された場合）", 33000, false],
    ]);
    expect(e.subtotalTaxable).toBe(80000);
    expect(e.tax).toBe(8000);
    expect(e.taxFree).toBe(33000);
    expect(e.total).toBe(121000);
    expect(e.stampFee.included).toBe(true);
    expect(e.number).toBe("Q-1234");
    expect(e.subject).toBe("在留期間の更新許可（特定技能）の申請費用（NGUYEN VAN A）");
    expect(e.addressee.orgLine).toBe("株式会社サンプル農園 御中");
    expect(e.addressee.repLine).toBe("代表取締役 稲田 浩夫 様");
    expect(e.issuer.name).toBe("登録支援機関 VUONG VAN THANH");
    expect(e.notes[0]).toContain("許可される在留期間によって金額が変わります");
    expect(e.notes[0]).toContain("「1年」で許可された場合");
    expect(e.notes.some((n) => n.includes("特定技能の支援代）10,000円/月"))).toBe(true);
    expect(e.salesKind).toBe("特定技能更新申請");
  });

  it("オンライン申請は金額が変わり、決済手数料の注意が付く", () => {
    const e = buildEstimate({ ...base, method: "オンライン", bandKey: "3月超6月以下" });
    expect(e.taxFree).toBe(15000);
    expect(e.notes.some((n) => n.includes("コンビニ決済"))).toBe(true);
  });

  it("本人負担: 収入印紙代の行を入れず、備考に本人負担である旨を出す", () => {
    const e = buildEstimate({ ...base, stampFeePayer: "本人負担" });
    expect(e.items).toHaveLength(2);
    expect(e.taxFree).toBe(0);
    expect(e.total).toBe(88000);
    expect(e.stampFee.included).toBe(false);
    expect(e.notes[0]).toContain("ご本人の負担");
  });

  it("認定: 会社負担でも手数料がかからないので行を入れず、備考にその旨を出す", () => {
    const e = buildEstimate({ ...base, appContent: "在留資格認定申請書の準備中", appType: "認定" });
    expect(e.items).toHaveLength(2);
    expect(e.stampFee.applies).toBe(false);
    expect(e.notes[0]).toContain("申請手数料（収入印紙代）はかかりません");
  });

  it("改定前の受付（9月30日まで）は一律の金額", () => {
    const e = buildEstimate({ ...base, plannedAppOn: "2026-09-25" });
    expect(e.items[2].amount).toBe(6000);
    expect(e.items[2].name).toContain("改定前");
    expect(e.notes[0]).toContain("改定前の手数料");
  });

  it("個人名の機関は様。代表者の行は出さない。番号なしのTODOは見積書番号なし", () => {
    const e = buildEstimate({ ...base, orgName: "稲田 浩夫", todoNo: "" });
    expect(e.addressee.orgLine).toBe("稲田 浩夫 様");
    expect(e.addressee.repLine).toBe("");
    expect(e.number).toBe("");
  });

  it("特定技能の変更・更新で総合保険が会社負担なら保険料の行（非課税）を足す", () => {
    const e = buildEstimate({ ...base, sswInsuranceBurden: "会社負担" });
    expect(e.items.map((i) => [i.name, i.amount, i.taxable])).toContainEqual(["特定技能総合保険（会社負担）", 8820, false]);
    expect(e.taxFree).toBe(33000 + 8820);
    expect(e.total).toBe(80000 + 8000 + 33000 + 8820);
    expect(e.taxFreeLabel).toBe("収入印紙代・特定技能総合保険");
    expect(e.notes.some((n) => n.includes("特定技能総合保険（会社負担）の保険料は非課税"))).toBe(true);
    // 本人負担（印紙代）でも保険の行は入り、内訳の名前は保険だけ
    const e2 = buildEstimate({ ...base, sswInsuranceBurden: "会社負担", stampFeePayer: "本人負担" });
    expect(e2.taxFreeLabel).toBe("特定技能総合保険");
    expect(e2.items.map((i) => i.name)).toEqual(["申請取次費用", "書類作成費", "特定技能総合保険（会社負担）"]);
    // 2号への変更も特定技能の変更
    expect(sswInsuranceIncluded("特定技能2号申請準備中", "変更", "会社負担")).toBe(true);
  });

  it("総合保険: 外国人負担・未設定・認定・特定活動のときは入れない", () => {
    expect(buildEstimate({ ...base, sswInsuranceBurden: "外国人負担" }).insurance.included).toBe(false);
    expect(buildEstimate({ ...base, sswInsuranceBurden: "" }).insurance.included).toBe(false);
    expect(sswInsuranceIncluded("在留資格認定申請書の準備中", "認定", "会社負担")).toBe(false);
    expect(sswInsuranceIncluded("特定活動で申請準備中", "特定活動", "会社負担")).toBe(false);
    expect(sswInsuranceIncluded("特定活動ビザ更新の申請準備", "更新", "会社負担")).toBe(false);
  });

  it("金額が読めない明細は0円で入れて、項目名を知らせる", () => {
    const e = buildEstimate({ ...base, salesItems: [{ name: "申請取次費用", amount: "要相談" }] });
    expect(e.items[0].amount).toBe(0);
    expect(e.invalidAmounts).toEqual(["申請取次費用"]);
  });
});
