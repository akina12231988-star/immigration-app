import { describe, expect, it } from "vitest";
import {
  defaultStampFeePayer,
  effectiveStampFeePayer,
  filterStampFeeByOrg,
  groupStampFeeByOrg,
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
