import { describe, expect, test } from "vitest";
import {
  addMonthsYmd,
  extendedValidUntil,
  needsExtensionDecision,
  postingValidUntil,
} from "@/lib/posting-validity";

describe("addMonthsYmd", () => {
  test("月を足す（同じ日）", () => {
    expect(addMonthsYmd("2026-01-10", 3)).toBe("2026-04-10");
    expect(addMonthsYmd("2026-11-15", 3)).toBe("2027-02-15");
  });
  test("足した先に無い日はその月の末日に丸める", () => {
    expect(addMonthsYmd("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsYmd("2026-03-31", 3)).toBe("2026-06-30");
  });
});

describe("postingValidUntil", () => {
  test("valid_until があればそのまま", () => {
    expect(postingValidUntil("2026-01-10", "2026-12-31")).toBe("2026-12-31");
  });
  test("無ければ受付日から3か月の前日", () => {
    expect(postingValidUntil("2026-01-10", null)).toBe("2026-04-09");
    expect(postingValidUntil("2026-05-20", "")).toBe("2026-08-19");
  });
});

describe("needsExtensionDecision", () => {
  const base = {
    status: "募集中",
    received_on: "2026-01-10",
    valid_until: null,
    openings: 2,
    hired: 1,
  };
  test("期限を過ぎて採用が足りない募集中の求人は対象", () => {
    expect(needsExtensionDecision(base, "2026-04-10")).toBe(true);
  });
  test("期限内・採用が足りている・募集中でない求人は対象外", () => {
    expect(needsExtensionDecision(base, "2026-04-09")).toBe(false); // 期限当日まで有効
    expect(needsExtensionDecision({ ...base, hired: 2 }, "2026-04-10")).toBe(false);
    expect(needsExtensionDecision({ ...base, status: "充足" }, "2026-04-10")).toBe(false);
  });
  test("求人数が未設定なら、期限切れの募集中は対象", () => {
    expect(needsExtensionDecision({ ...base, openings: null, hired: 3 }, "2026-04-10")).toBe(
      true,
    );
  });
});

describe("extendedValidUntil", () => {
  test("今の期限から3か月延ばす", () => {
    expect(extendedValidUntil("2026-01-10", null)).toBe("2026-07-09");
    expect(extendedValidUntil("2026-01-10", "2026-04-30")).toBe("2026-07-30");
  });
});
