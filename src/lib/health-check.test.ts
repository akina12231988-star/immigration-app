import { describe, expect, it } from "vitest";
import { healthCheckValidUntil, isHealthCheckValid } from "./health-check";

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
