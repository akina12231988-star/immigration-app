import { describe, expect, it } from "vitest";
import type { WorkerDependent } from "@/types/db";
import {
  fuyoAttachedStale,
  fuyoFormNames,
  fuyoTargetYear,
  fuyoYearEndJudgement,
  isRemittanceItemName,
  recommendedFuyoKind,
} from "./fuyo-judgement";

const TODAY = "2026-11-08";
const dep = (name: string, relation: string, birth: string, amounts: string[] = [], year = "2026"): WorkerDependent => ({
  name,
  kana: "",
  relation,
  birth,
  address: "",
  occupation: "",
  my_number: "",
  income: "",
  remittances: amounts.map((amount) => ({ year, amount })),
});

describe("fuyoYearEndJudgement（送金額から扶養控除等申告書の判定）", () => {
  it("扶養家族なし・送金額が未入力", () => {
    expect(fuyoYearEndJudgement([], TODAY, "2026").kind).toBe("no-dependents");
    expect(fuyoYearEndJudgement([dep("A", "父", "1970-01-01")], TODAY, "2026").kind).toBe("not-entered");
    // 別の年の送金しか無いのも未入力
    expect(fuyoYearEndJudgement([dep("A", "父", "1970-01-01", ["400000"], "2025")], TODAY, "2026").kind).toBe("not-entered");
  });
  it("全員達成なら入社時のままでよい", () => {
    const j = fuyoYearEndJudgement([dep("A", "父", "1970-01-01", ["200,000", "200,000"]), dep("B", "妹", "2005-01-01", ["1"])], TODAY, "2026");
    expect(j.kind).toBe("all-achieved");
    expect(recommendedFuyoKind(j)).toBe("入社時");
  });
  it("一部だけ達成なら作り直し（年末調整時は達成した人だけ）", () => {
    const j = fuyoYearEndJudgement([dep("A", "父", "1970-01-01", ["400000"]), dep("B", "母", "1972-01-01", ["390000"]), dep("C", "妹", "2005-01-01", ["0"])], TODAY, "2026");
    expect(j.kind).toBe("partial");
    expect(fuyoFormNames(j, "年末調整時")).toEqual(["A", "B"]);
    expect(fuyoFormNames(j, "入社時")).toEqual(["A", "B", "C"]);
    expect(recommendedFuyoKind(j)).toBe("年末調整時");
  });
  it("誰も達成していない", () => {
    expect(fuyoYearEndJudgement([dep("A", "父", "1970-01-01", ["120000"])], TODAY, "2026").kind).toBe("none-achieved");
  });
});

describe("fuyoAttachedStale（添付後に送金額が変わったか）", () => {
  const j = fuyoYearEndJudgement([dep("A", "父", "1970-01-01", ["400000"]), dep("B", "母", "1972-01-01", ["100"])], TODAY, "2026");
  it("添付した申告書の人と、いま載るべき人が違えば作り直し", () => {
    expect(fuyoAttachedStale({ kind: "年末調整時", year: "2026", names: ["A", "B"] }, j)).toBe(true);
    expect(fuyoAttachedStale({ kind: "年末調整時", year: "2026", names: ["A"] }, j)).toBe(false);
    expect(fuyoAttachedStale({ kind: "入社時", year: "2026", names: ["B", "A"] }, j)).toBe(false);
    expect(fuyoAttachedStale(null, j)).toBe(false);
  });
});

describe("fuyoTargetYear・isRemittanceItemName", () => {
  it("書類名・依頼名の年、無ければ今日の年", () => {
    expect(fuyoTargetYear("扶養控除申告書", "令和8年 年末調整資料", TODAY)).toBe("2026");
    expect(fuyoTargetYear("2025年送金証明書", "", TODAY)).toBe("2025");
    expect(fuyoTargetYear("扶養控除申告書", "年末調整", TODAY)).toBe("2026");
  });
  it("送金証明書の項目", () => {
    expect(isRemittanceItemName("2026年送金証明書")).toBe(true);
    expect(isRemittanceItemName("扶養控除申告書")).toBe(false);
  });
});
