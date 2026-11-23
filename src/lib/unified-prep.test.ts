import { describe, expect, it } from "vitest";
import { canUseUnifiedPrep } from "./unified-prep";

describe("申請書類作成をアプリ一本化計画（試験用ページを開ける人）", () => {
  it("管理者と職員（閲覧のみの人は開けない）", () => {
    expect(canUseUnifiedPrep("admin")).toBe(true);
    expect(canUseUnifiedPrep("staff")).toBe(true);
    expect(canUseUnifiedPrep("viewer")).toBe(false);
    expect(canUseUnifiedPrep(null)).toBe(false);
  });
});
