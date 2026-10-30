import { describe, expect, it } from "vitest";
import {
  effectiveHousingMain,
  housingFallbackText,
  housingPatternOf,
  housingPlanToJson,
  normalizeHousingPlan,
  pickPrepWage,
} from "./prep-117-housing";
import { emptyLodging } from "./organization-intake";
import type { WorkerWage } from "@/types/db";

const lodgings = [
  { ...emptyLodging("lodging-1"), name: "第1寮", kind: "自己所有物件" },
  { ...emptyLodging("lodging-2"), name: "第2寮", kind: "賃貸物件" },
  { ...emptyLodging("lodging-3"), name: "旧寮", kind: "" },
];

describe("１－１７号の住居 A・B・C", () => {
  it("外国人本人が契約するなら A", () => {
    expect(housingPatternOf({ housing_self_contract: true, housing_lodging_id: "lodging-1" }, lodgings).key).toBe("A");
  });
  it("社宅の自己所有物件は B、賃貸物件は C（区分が未設定も C）", () => {
    expect(housingPatternOf({ housing_lodging_id: "lodging-1" }, lodgings).key).toBe("B");
    expect(housingPatternOf({ housing_lodging_id: "lodging-2", housing_amount: 20000 }, lodgings)).toMatchObject({
      key: "C",
      amount: 20000,
    });
    expect(housingPatternOf({ housing_lodging_id: "lodging-3" }, lodgings).key).toBe("C");
  });
  it("未入力・寮が見つからないときは決めない", () => {
    expect(housingPatternOf(null, lodgings).key).toBeNull();
    expect(housingPatternOf({ housing_lodging_id: "lodging-9" }, lodgings).key).toBeNull();
  });
});

describe("申請準備で見る賃金の記録", () => {
  const w = (id: string, org: string | null, detail: WorkerWage["detail"]) =>
    ({ id, organization_id: org, detail }) as WorkerWage;
  it("この所属機関の、1-6号別紙を入れてある記録を選ぶ", () => {
    const wages = [w("1", "o2", { housing_self_contract: true }), w("2", "o1", {}), w("3", "o1", { housing_amount: 1 })];
    expect(pickPrepWage(wages, "o1")?.id).toBe("3");
  });
  it("この所属機関の記録が無ければ全体から選ぶ", () => {
    expect(pickPrepWage([w("1", "o2", { housing_amount: 1 })], "o1")?.id).toBe("1");
    expect(pickPrepWage([], "o1")).toBeNull();
  });
});

describe("住居の選択（housing_plan）", () => {
  it("保存した値を読む。壊れた値・main と同じ候補は未選択にする", () => {
    expect(normalizeHousingPlan({ main: "B", fallback: "C" })).toEqual({ main: "B", fallback: "C" });
    expect(normalizeHousingPlan({ main: "B", fallback: "B" })).toEqual({ main: "B", fallback: null });
    expect(normalizeHousingPlan({ main: "", fallback: "C" })).toEqual({ main: null, fallback: null });
    expect(normalizeHousingPlan({ main: "X" })).toEqual({ main: null, fallback: null });
    expect(normalizeHousingPlan(null)).toEqual({ main: null, fallback: null });
    expect(normalizeHousingPlan("B")).toEqual({ main: null, fallback: null });
  });

  it("保存する形は未選択を空文字にする", () => {
    expect(housingPlanToJson({ main: "A", fallback: "C" })).toEqual({ main: "A", fallback: "C" });
    expect(housingPlanToJson({ main: null, fallback: null })).toEqual({ main: "", fallback: "" });
    expect(housingPlanToJson({ main: "A", fallback: "A" })).toEqual({ main: "A", fallback: "" });
  });

  it("選択が無ければ 1-6号別紙の居住費からの候補を出す", () => {
    expect(effectiveHousingMain({ main: null, fallback: null }, "C")).toBe("C");
    expect(effectiveHousingMain({ main: "A", fallback: null }, "C")).toBe("A");
    expect(effectiveHousingMain({ main: null, fallback: null }, null)).toBeNull();
  });

  it("できなかったときの候補に書く文章", () => {
    expect(housingFallbackText("A")).toBe("Aの外国人本人による住居の契約ができなかった場合、実施予定");
    expect(housingFallbackText("B")).toBe("Bの社宅入居に合意しなかった場合、実施予定");
    expect(housingFallbackText("C")).toBe("Cの社宅入居に合意しなかった場合、実施予定");
  });
});
