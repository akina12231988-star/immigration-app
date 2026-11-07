import { describe, expect, it } from "vitest";
import {
  autoStampFeePayer,
  defaultStampFeePayer,
  effectiveStampFeePayer,
  filterStampFeeByOrg,
  groupStampFeeByOrg,
  invoiceStampFee,
  isKunisakiSeika,
  stampFeeUnknownText,
  type StampFeeUnknownRow,
} from "./stamp-fee";

describe("isKunisakiSeika（自動で本人負担にする会社）", () => {
  it("有限会社國崎青果だけ。法人格の書き方・異体字・全角半角の違いは同じ扱い", () => {
    expect(isKunisakiSeika("有限会社國崎青果")).toBe(true);
    expect(isKunisakiSeika("國崎青果有限会社")).toBe(true);
    expect(isKunisakiSeika("有限会社国崎青果")).toBe(true);
    expect(isKunisakiSeika("BASE株式会社")).toBe(false);
    expect(isKunisakiSeika("")).toBe(false);
    expect(isKunisakiSeika(null)).toBe(false);
  });
});

describe("defaultStampFeePayer / effectiveStampFeePayer", () => {
  it("國崎青果は本人負担、ほかは未設定", () => {
    expect(defaultStampFeePayer("有限会社國崎青果")).toBe("本人負担");
    expect(defaultStampFeePayer("株式会社さくら")).toBe("");
  });

  it("保存した値があればそれを使い、無ければ所属機関の既定", () => {
    expect(effectiveStampFeePayer("会社負担", "有限会社國崎青果")).toBe("会社負担");
    expect(effectiveStampFeePayer("", "有限会社國崎青果")).toBe("本人負担");
    expect(effectiveStampFeePayer("", "株式会社さくら")).toBe("");
    expect(effectiveStampFeePayer("おかしな値", "株式会社さくら")).toBe("");
  });
});

const rows: StampFeeUnknownRow[] = [
  { workerId: "w2", workerName: "TRAN VAN B", todoNo: "25-102", appContent: "特定技能更新の準備中", tantou: "", orgId: "o2", orgName: "株式会社ベース" },
  { workerId: "w1", workerName: "NGUYEN VAN A", todoNo: "25-101", appContent: "特定技能申請準備中", tantou: "野口", orgId: "o1", orgName: "株式会社さくら" },
  { workerId: "w3", workerName: "LE THI C", todoNo: "25-100", appContent: "特定技能更新の準備中", tantou: "", orgId: "", orgName: "" },
  { workerId: "w4", workerName: "PHAM VAN D", todoNo: "25-099", appContent: "特定技能更新の準備中", tantou: "", orgId: "o1", orgName: "株式会社さくら" },
];

describe("groupStampFeeByOrg", () => {
  it("所属機関別にまとめ、機関名の順。未登録は最後。中はTODO番号の順", () => {
    const groups = groupStampFeeByOrg(rows);
    expect(groups.map((g) => g.orgName)).toEqual(["株式会社さくら", "株式会社ベース", "所属機関が未登録"]);
    expect(groups[0].rows.map((r) => r.todoNo)).toEqual(["25-099", "25-101"]);
    expect(groups[2].orgId).toBe("");
  });
});

describe("filterStampFeeByOrg", () => {
  it("所属機関で絞る（空はすべて）", () => {
    expect(filterStampFeeByOrg(rows, "o1").map((r) => r.workerId)).toEqual(["w1", "w4"]);
    expect(filterStampFeeByOrg(rows, "")).toHaveLength(4);
  });
});

describe("stampFeeUnknownText", () => {
  it("機関ごとの見出しと1人1行のテキストにする", () => {
    const text = stampFeeUnknownText(groupStampFeeByOrg(rows), "2026-10-01");
    expect(text.split("\n")[0]).toBe("収入印紙代の負担が未設定の申請（2026-10-01 現在・4件）");
    expect(text).toContain("■ 株式会社さくら（2件）");
    expect(text).toContain("・25-101　NGUYEN VAN A　特定技能申請準備中　担当: 野口");
    expect(text).toContain("■ 所属機関が未登録（1件）");
    expect(text.endsWith("\n")).toBe(false);
  });
});

describe("会社立替・所属機関の既定の負担", () => {
  it("会社立替も保存した値として使える", () => {
    expect(effectiveStampFeePayer("会社立替", "株式会社さくら")).toBe("会社立替");
  });
  it("未設定なら所属機関の情報で選んだ負担を使い、無ければ國崎青果の既定", () => {
    expect(effectiveStampFeePayer("", "株式会社さくら", "会社負担")).toBe("会社負担");
    expect(effectiveStampFeePayer("", "有限会社國崎青果", "会社立替")).toBe("会社立替");
    expect(effectiveStampFeePayer("", "有限会社國崎青果", "")).toBe("本人負担");
    expect(effectiveStampFeePayer("本人負担", "株式会社さくら", "会社負担")).toBe("本人負担");
  });
});

describe("invoiceStampFee（許可後の請求での印紙代）", () => {
  it("6,000円以下は負担の設定にかかわらず会社負担で請求", () => {
    const r = invoiceStampFee(6000, "本人負担");
    expect(r.billed).toBe(true);
    expect(r.payer).toBe("会社負担");
    expect(invoiceStampFee(5500, "").billed).toBe(true);
  });
  it("6,000円を超えると負担の設定で分ける", () => {
    expect(invoiceStampFee(27000, "会社負担")).toMatchObject({ billed: true, state: "billed" });
    const tatekae = invoiceStampFee(27000, "会社立替");
    expect(tatekae.billed).toBe(true);
    expect(tatekae.note).toContain("会社立替");
    const self = invoiceStampFee(27000, "本人負担");
    expect(self.billed).toBe(false);
    expect(self.note).toBe("印紙代は本人負担です。");
    expect(invoiceStampFee(27000, "").state).toBe("unknown_payer");
  });
  it("金額が未入力・0円", () => {
    expect(invoiceStampFee(null, "会社負担").state).toBe("unknown_amount");
    expect(invoiceStampFee(0, "会社負担").state).toBe("none");
  });
});

describe("autoStampFeePayer（申請種別で自動で決まる負担）", () => {
  it("特定技能2号に関わる申請は本人負担", () => {
    expect(autoStampFeePayer("特定技能2号申請準備中", "株式会社さくら")).toBe("本人負担");
    expect(autoStampFeePayer("特定技能2号更新の準備中", "有限会社國崎青果")).toBe("本人負担");
    expect(autoStampFeePayer("特定活動（特定技能２号移行準備のため）準備中", "株式会社さくら")).toBe("本人負担");
  });
  it("特定技能1号に関わる申請で國崎青果なら会社立替、ほかの機関は自動では決めない", () => {
    expect(autoStampFeePayer("特定技能申請準備中", "有限会社國崎青果")).toBe("会社立替");
    expect(autoStampFeePayer("特定技能更新の準備中", "国崎青果")).toBe("会社立替");
    expect(autoStampFeePayer("特定活動ビザ更新の申請準備", "有限会社國崎青果")).toBe("会社立替");
    expect(autoStampFeePayer("特定技能更新の準備中", "株式会社さくら")).toBe("");
    expect(autoStampFeePayer("在留資格認定申請書の準備中", "有限会社國崎青果")).toBe("");
  });
  it("未保存なら自動の負担が所属機関の情報の負担より優先、保存した値はそのまま", () => {
    expect(effectiveStampFeePayer("", "株式会社さくら", "会社負担", "特定技能2号申請準備中")).toBe("本人負担");
    expect(effectiveStampFeePayer("", "有限会社國崎青果", "", "特定技能申請準備中")).toBe("会社立替");
    expect(effectiveStampFeePayer("会社負担", "株式会社さくら", "", "特定技能2号申請準備中")).toBe("会社負担");
  });
});
