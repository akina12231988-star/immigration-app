import { describe, expect, it } from "vitest";
import {
  EMPTY_HEALTH_DETAIL,
  HEALTH_EXAM_ITEMS,
  healthCheckValidUntil,
  isHealthCheckValid,
  isHealthDetailComplete,
  type HealthCheckDetail,
} from "./health-check";

function detail(over: Partial<HealthCheckDetail>): HealthCheckDetail {
  return { ...EMPTY_HEALTH_DETAIL, ...over };
}
const TODAY = "2026-07-23";
const VALID_EXAM = "2026-05-01"; // 1年以内

describe("healthCheckValidUntil", () => {
  it("受診日の1年後を返す", () => {
    expect(healthCheckValidUntil("2026-07-16")).toBe("2027-07-16");
    expect(healthCheckValidUntil("2025-01-01")).toBe("2026-01-01");
  });

  it("うるう日（2/29）は翌年の月末に丸める", () => {
    expect(healthCheckValidUntil("2024-02-29")).toBe("2025-02-28");
  });

  it("未設定・不正な入力は空文字", () => {
    expect(healthCheckValidUntil(null)).toBe("");
    expect(healthCheckValidUntil("")).toBe("");
    expect(healthCheckValidUntil("2026/07/16")).toBe("");
  });
});

describe("isHealthCheckValid", () => {
  it("有効期限当日までは有効", () => {
    expect(isHealthCheckValid("2026-07-16", "2026-07-16")).toBe(true); // 受診当日
    expect(isHealthCheckValid("2026-07-16", "2027-07-16")).toBe(true); // 期限当日
  });

  it("有効期限を過ぎると無効", () => {
    expect(isHealthCheckValid("2026-07-16", "2027-07-17")).toBe(false);
  });

  it("受診日未設定は無効", () => {
    expect(isHealthCheckValid(null, "2026-07-16")).toBe(false);
  });
});

describe("isHealthDetailComplete", () => {
  it("ファイルが無い・期限切れなら未完了", () => {
    expect(isHealthDetailComplete(detail({ form_type: "official" }), false, VALID_EXAM, TODAY)).toBe(false);
    expect(isHealthDetailComplete(detail({ form_type: "official" }), true, "2025-01-01", TODAY)).toBe(false);
  });

  it("公式様式(1〜3号)は項目チェック不要で完了", () => {
    expect(isHealthDetailComplete(detail({ form_type: "official" }), true, VALID_EXAM, TODAY)).toBe(true);
  });

  it("公式様式で要精査（後日就労可）は、その後の結果が入るまで未完了", () => {
    expect(
      isHealthDetailComplete(detail({ form_type: "official", needs_followup: true }), true, VALID_EXAM, TODAY),
    ).toBe(false);
    expect(
      isHealthDetailComplete(
        detail({ form_type: "official", needs_followup: true, followup_result: "就労可" }),
        true,
        VALID_EXAM,
        TODAY,
      ),
    ).toBe(true);
  });

  it("病院書式は全受診項目が確認済みで完了", () => {
    const all = HEALTH_EXAM_ITEMS.map((i) => i.id).join(",");
    expect(isHealthDetailComplete(detail({ form_type: "hospital", checked_items: all }), true, VALID_EXAM, TODAY)).toBe(true);
    const partial = HEALTH_EXAM_ITEMS.slice(0, 3).map((i) => i.id).join(",");
    expect(isHealthDetailComplete(detail({ form_type: "hospital", checked_items: partial }), true, VALID_EXAM, TODAY)).toBe(false);
  });

  it("様式未選択は未完了", () => {
    expect(isHealthDetailComplete(detail({}), true, VALID_EXAM, TODAY)).toBe(false);
  });
});
