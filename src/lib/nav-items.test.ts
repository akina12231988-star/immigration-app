import { describe, expect, it } from "vitest";
import { NAV_ITEMS, mobileNavItems } from "./nav-items";

describe("スマホの下部タブの並び", () => {
  it("1行目はホーム・外国人・所属機関・申請一覧・通知書の順", () => {
    expect(mobileNavItems().primary.map((i) => i.short)).toEqual(["ホーム", "外国人", "所属機関", "申請一覧", "通知書"]);
  });
  it("残りは「その他」に元の並びのまま入り、どの項目も欠けない", () => {
    const { primary, rest } = mobileNavItems();
    expect(rest.map((i) => i.href)).toEqual(
      NAV_ITEMS.filter((i) => !primary.includes(i)).map((i) => i.href),
    );
    expect(primary.length + rest.length).toBe(NAV_ITEMS.length);
    expect(rest.map((i) => i.short)).toContain("お知らせ");
    expect(rest.map((i) => i.short)).toContain("入社書類");
  });
});
