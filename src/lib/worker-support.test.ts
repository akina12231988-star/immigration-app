import { describe, expect, it } from "vitest";
import { suggestSupportScope } from "./worker-support";

describe("支援区分の自動判別", () => {
  it("特定技能2号とその移行準備は支援対象外", () => {
    expect(suggestSupportScope("特定技能2号", "在籍中")).toBe("支援対象外");
    expect(suggestSupportScope("特定活動（特定技能2号移行準備）", "在籍中")).toBe("支援対象外");
    // 全角の２号でも同じ
    expect(suggestSupportScope("特定技能２号", "在籍中")).toBe("支援対象外");
  });

  it("特定技能1号とその移行準備は支援対象", () => {
    expect(suggestSupportScope("特定技能1号", "在籍中")).toBe("支援対象");
    expect(suggestSupportScope("特定活動（特定技能1号移行準備）", "在籍中")).toBe("支援対象");
    expect(suggestSupportScope("特定技能1号更新", "在籍中")).toBe("支援対象");
  });

  it("申請準備中はまだ支援開始前", () => {
    expect(suggestSupportScope("特定技能1号", "申請準備中")).toBe("支援開始前");
    // 2号は準備中でも支援対象外のまま
    expect(suggestSupportScope("特定技能2号", "申請準備中")).toBe("支援対象外");
  });

  it("技能実習はこれから特定技能へ移るので支援開始前", () => {
    expect(suggestSupportScope("技能実習1号", "在籍中")).toBe("支援開始前");
    expect(suggestSupportScope("技能実習3号", "在籍中")).toBe("支援開始前");
  });

  it("退職・帰国・求職活動中では支援区分を変えない", () => {
    // 退職と同時に支援対象外にすると退職月の日割り請求が名簿から消えるため
    expect(suggestSupportScope("特定技能1号", "退職")).toBeNull();
    expect(suggestSupportScope("特定技能1号", "帰国")).toBeNull();
    expect(suggestSupportScope("特定技能1号", "求職活動中")).toBeNull();
  });

  it("在留資格が未設定なら判断しない", () => {
    expect(suggestSupportScope("", "在籍中")).toBeNull();
    expect(suggestSupportScope(null, "在籍中")).toBeNull();
  });
});
