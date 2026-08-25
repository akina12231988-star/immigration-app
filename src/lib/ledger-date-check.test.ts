import { describe, expect, it } from "vitest";
import {
  checkLedgerDates,
  hasLedgerDateIssue,
  issueKinds,
  type LedgerDates,
} from "./ledger-date-check";

const base: LedgerDates = {
  postingReceivedOn: "2026-05-15",
  jobseekerAcceptedOn: "2026-05-01",
  appliedOn: "2026-05-20",
  resultOn: "2026-06-04",
  result: "採用",
};

describe("checkLedgerDates", () => {
  it("正しい流れなら何も出ない", () => {
    expect(checkLedgerDates(base)).toEqual([]);
    expect(hasLedgerDateIssue(base)).toBe(false);
  });

  it("求職受付日が求人受付年月日より前でも問題にしない", () => {
    // base がまさにその形（求職受付 5/1 → 求人受付 5/15）
    expect(checkLedgerDates({ ...base, jobseekerAcceptedOn: "2020-01-01" })).toEqual([]);
  });

  it("紹介年月日が求人受付年月日より前なら知らせる", () => {
    const issues = checkLedgerDates({ ...base, appliedOn: "2026-05-10" });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("紹介年月日");
    expect(issues[0].message).toContain("求人受付年月日");
  });

  it("紹介年月日が求職受付日より前なら知らせる", () => {
    const issues = checkLedgerDates({
      ...base,
      jobseekerAcceptedOn: "2026-06-01",
      postingReceivedOn: null,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("求職受付日");
  });

  it("採用年月日が紹介年月日より前なら知らせる", () => {
    const issues = checkLedgerDates({ ...base, resultOn: "2026-05-19" });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("採用年月日");
  });

  it("採用なのに採用年月日が空なら知らせる", () => {
    const issues = checkLedgerDates({ ...base, resultOn: null });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("入っていません");
  });

  it("採用以外は採用年月日を見ない（不採用・辞退・選考中）", () => {
    for (const result of ["不採用", "辞退", "選考中"]) {
      expect(checkLedgerDates({ ...base, result, resultOn: null })).toEqual([]);
      // 不採用の結果日が紹介年月日より前でも帳簿には出ないため知らせない
      expect(checkLedgerDates({ ...base, result, resultOn: "2026-05-19" })).toEqual([]);
    }
  });

  it("日付が空のところは比べない（未入力は別の問題として扱う）", () => {
    expect(
      checkLedgerDates({
        postingReceivedOn: null,
        jobseekerAcceptedOn: null,
        appliedOn: null,
        resultOn: null,
        result: "選考中",
      }),
    ).toEqual([]);
  });

  it("おかしいところが複数あればまとめて出す", () => {
    const issues = checkLedgerDates({
      postingReceivedOn: "2026-05-15",
      jobseekerAcceptedOn: "2026-05-10",
      appliedOn: "2026-05-01",
      resultOn: "2026-04-01",
      result: "採用",
    });
    expect(issues).toHaveLength(3);
  });
});

describe("契約書・雇用開始日までの流れ", () => {
  const full: LedgerDates = {
    ...base,
    conditionsOn: "2026-06-10",
    contractOn: "2026-06-12",
    employmentStartOn: "2026-08-10",
  };

  it("応募 → 結果 → 条件書 → 契約 → 雇用開始 の順なら何も出ない", () => {
    expect(checkLedgerDates(full)).toEqual([]);
  });

  it("雇用契約日が採用年月日より前なら、雇用契約日を訂正するよう出す", () => {
    // 紹介年月日（5/20）より後だが、採用年月日（6/4）より前
    const issues = checkLedgerDates({ ...full, contractOn: "2026-05-30" });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("雇用契約日");
    expect(issues[0].message).toContain("採用年月日");
  });

  it("応募より前の日付は、いちばん手前の紹介年月日と比べて知らせる", () => {
    const issues = checkLedgerDates({ ...full, contractOn: "2026-04-30" });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("雇用契約日");
    expect(issues[0].message).toContain("紹介年月日");
  });

  it("雇用条件書の作成日が紹介年月日より前なら、そこを訂正するよう出す", () => {
    const issues = checkLedgerDates({ ...full, conditionsOn: "2026-04-25" });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("雇用条件書の作成日");
    expect(issues[0].message).toContain("紹介年月日");
  });

  it("条件書と契約日はどちらが先でも問題にしない", () => {
    expect(
      checkLedgerDates({ ...full, conditionsOn: "2026-06-12", contractOn: "2026-06-10" }),
    ).toEqual([]);
  });

  it("雇用開始日が雇用契約日より前なら、雇用開始日を訂正するよう出す", () => {
    const issues = checkLedgerDates({ ...full, employmentStartOn: "2026-06-11" });
    expect(issues.map((i) => i.kind)).toEqual(["雇用開始日"]);
    expect(issues[0].message).toContain("雇用契約日");
  });

  it("雇用開始日が採用年月日より前なら知らせる", () => {
    const issues = checkLedgerDates({
      ...full,
      contractOn: "",
      employmentStartOn: "2026-06-03",
    });
    expect(issues.map((i) => i.kind)).toEqual(["雇用開始日"]);
    expect(issues[0].message).toContain("採用年月日");
  });

  it("採用以外なら、契約書の日付は採用年月日と比べない（紹介年月日とだけ比べる）", () => {
    expect(
      checkLedgerDates({ ...full, result: "選考中", resultOn: null, contractOn: "2026-06-12" }),
    ).toEqual([]);
    expect(
      checkLedgerDates({ ...full, result: "選考中", resultOn: null, contractOn: "2026-05-01" }),
    ).toHaveLength(1);
  });

  it("訂正が必要な日付の種類だけを取り出せる（画面の赤い枠に使う）", () => {
    const issues = checkLedgerDates({
      ...full,
      contractOn: "2026-04-30",
      conditionsOn: "2026-04-25",
    });
    expect([...issueKinds(issues)].sort()).toEqual(["雇用契約日", "雇用条件書の作成日"].sort());
  });
});
