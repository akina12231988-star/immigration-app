import { describe, expect, it } from "vitest";
import { activeGuidedOn } from "./passport-renewal";

describe("activeGuidedOn", () => {
  it("記録が無ければ未案内（null）", () => {
    expect(activeGuidedOn(undefined, "2026-11-07")).toBeNull();
    expect(activeGuidedOn(null, "2026-11-07")).toBeNull();
  });

  it("guided_on が空なら未案内", () => {
    expect(activeGuidedOn({ guided_on: null, guided_expiry: null }, "2026-11-07")).toBeNull();
  });

  it("案内時の有効期限が今と同じなら案内済み", () => {
    expect(
      activeGuidedOn({ guided_on: "2026-08-29", guided_expiry: "2026-11-07" }, "2026-11-07"),
    ).toBe("2026-08-29");
  });

  it("パスポートが更新されて有効期限が変わったら、前回の案内は数えない", () => {
    expect(
      activeGuidedOn({ guided_on: "2026-08-29", guided_expiry: "2026-11-07" }, "2031-11-07"),
    ).toBeNull();
  });

  it("guided_expiry が空の古い記録は案内済みとして扱う", () => {
    expect(
      activeGuidedOn({ guided_on: "2026-08-29", guided_expiry: null }, "2026-11-07"),
    ).toBe("2026-08-29");
  });

  it("今の有効期限が未登録でも、案内した記録はそのまま見せる", () => {
    expect(
      activeGuidedOn({ guided_on: "2026-08-29", guided_expiry: "2026-11-07" }, null),
    ).toBe("2026-08-29");
  });
});
