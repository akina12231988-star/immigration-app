import { describe, expect, test } from "vitest";
import {
  addDaysYmd,
  addYearsYmd,
  computePlanDates,
  midYmd,
  planDatesText,
  recommendedApplyDate,
  recommendedContractDate,
  recommendedDocDate,
} from "@/lib/support-plan-dates";

describe("日付の計算ヘルパー", () => {
  test("日数・年数の加算と中間日", () => {
    expect(addDaysYmd("2026-10-01", -14)).toBe("2026-09-17");
    expect(addYearsYmd("2026-10-01", 5)).toBe("2031-10-01");
    expect(midYmd("2026-09-01", "2026-09-11")).toBe("2026-09-06");
  });
});

describe("computePlanDates（ツールと同じルール）", () => {
  test("雇用開始日だけ入力: 契約日は14日前、書類作成日は3日前と推定される", () => {
    const r = computePlanDates({ employStart: "2026-10-01", isLegal: false });
    expect(r.con).toBe("2026-09-17");
    expect(r.conEstimated).toBe(true);
    expect(r.cond).toBe("2026-09-16"); // 契約日の前日
    expect(r.doc).toBe("2026-09-28"); // 雇用開始日の3日前
    expect(r.scEnd).toBe("2031-09-16"); // 契約日から5年−1日
    expect(r.eeEnd).toBe("2027-09-30"); // 個人=1年−1日
    expect(r.orient).toBe("2026-10-15"); // 2週間後
    expect(r.sign).toBe("2026-09-29"); // 書類作成日の翌日
    expect(r.signBasis).toBe("nextday");
    expect(r.errors).toEqual([]);
  });

  test("申請予定日あり: 書類作成日は前日、署名日は書類作成日〜申請予定日の中間", () => {
    const r = computePlanDates({
      employStart: "2026-10-01",
      applyDate: "2026-09-01",
      isLegal: true,
    });
    expect(r.doc).toBe("2026-08-31");
    expect(r.sign).toBe("2026-08-31"); // 中間（前日と当日の中間は floor）
    expect(r.signBasis).toBe("mid");
    expect(r.eeEnd).toBe("2028-09-30"); // 法人=2年−1日
  });

  test("健康診断受診日があれば署名日は max(書類作成日, 受診日)", () => {
    const base = { employStart: "2026-10-01", applyDate: "2026-09-15", isLegal: false };
    expect(computePlanDates({ ...base, healthDate: "2026-09-20" }).sign).toBe("2026-09-20");
    expect(computePlanDates({ ...base, healthDate: "2026-09-01" }).sign).toBe("2026-09-14"); // 書類作成日
    expect(computePlanDates({ ...base, healthDate: "2026-09-20" }).signBasis).toBe("health");
  });

  test("入力エラーの検知（契約日が開始日以降・書類作成日が範囲外・申請予定日が開始日より後）", () => {
    const r = computePlanDates({
      employStart: "2026-10-01",
      contractDate: "2026-10-05",
      docDate: "2026-10-03",
      applyDate: "2026-10-10",
      isLegal: false,
    });
    expect(r.errors).toHaveLength(3);
  });
});

describe("推奨日（ステップカレンダー）", () => {
  test("申請予定日=開始日の30日前 / 契約日=申請予定日の7日前 / 書類作成日=申請予定日の前日", () => {
    expect(recommendedApplyDate("2026-10-01")).toBe("2026-09-01");
    expect(recommendedContractDate("2026-09-01", "2026-10-01")).toBe("2026-08-25");
    expect(recommendedContractDate(null, "2026-10-01")).toBe("2026-09-24");
    expect(recommendedDocDate("2026-09-01", "2026-10-01")).toBe("2026-08-31");
    expect(recommendedDocDate(null, "2026-10-01")).toBe("2026-09-28");
  });
});

describe("planDatesText", () => {
  test("コピー用テキストがツールと同じ並びで出る", () => {
    const r = computePlanDates({ employStart: "2026-10-01", applyDate: "2026-09-01", isLegal: false });
    const text = planDatesText({ name: "NGUYEN VAN A", org: "テスト農園", todo: "812" }, r, "2026-09-01");
    expect(text).toContain("【特定技能 支援計画書 日付一覧】");
    expect(text).toContain("TODO: 812");
    expect(text).toContain("申請予定日：2026年9月1日");
    expect(text).toContain("生活オリエンテーション実施日（参考様式1-17号）：2026年10月15日");
  });
});
