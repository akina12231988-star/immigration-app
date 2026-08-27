import { describe, expect, it } from "vitest";
import { alertOpenFrom, alertOpenKey } from "@/lib/dashboard-alert-open";

describe("alertOpenKey", () => {
  it("アラートごとに別の覚え方をする", () => {
    expect(alertOpenKey("expiry")).toBe("dashboard-alert-open:expiry");
    expect(alertOpenKey("insurance")).not.toBe(alertOpenKey("expiry"));
  });
});

describe("alertOpenFrom", () => {
  it("開いた覚えがあれば開く", () => {
    expect(alertOpenFrom("1", false)).toBe(true);
  });

  it("閉じた覚えがあれば閉じる（既定が開くでも）", () => {
    expect(alertOpenFrom("0", true)).toBe(false);
  });

  it("覚えが無ければ既定にしたがう", () => {
    expect(alertOpenFrom(null, false)).toBe(false);
    expect(alertOpenFrom(null, true)).toBe(true);
  });

  it("知らない値でも既定にしたがう（壊れた覚えで開きっぱなしにしない）", () => {
    expect(alertOpenFrom("なにか", false)).toBe(false);
  });
});
